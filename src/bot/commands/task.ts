import path from "node:path";

import { InlineKeyboard, type Bot, type Context } from "grammy";

import type { AppConfig } from "../../config/index.js";
import { ValidationError } from "../../core/errors.js";
import type { EventBusLike, LoggerLike } from "../../core/types.js";
import { DEFAULT_TASK_LOG_LIMIT } from "../../shared/constants.js";
import { chunkMessage } from "../../shared/utils.js";
import type { AgentRegistry } from "../../services/agent/agent-registry.js";
import type { ITaskQueue } from "../../services/task/task-queue.js";
import type { TaskStore } from "../../services/task/task-store.js";
import type { RepositoryCatalog, RepositoryOption } from "../../services/workspace/repository-catalog.js";
import type { PendingTaskInputStore } from "../pending-task-input-store.js";
import type { RepositorySelectionStore } from "../repository-selection-store.js";

interface TaskCommandDependencies {
  config: AppConfig;
  eventBus: EventBusLike;
  logger: LoggerLike;
  taskStore: TaskStore;
  taskQueue: ITaskQueue;
  agentRegistry: AgentRegistry;
  pendingTaskInputStore: PendingTaskInputStore;
  repositoryCatalog: RepositoryCatalog;
  repositorySelectionStore: RepositorySelectionStore;
}

const extractCommandPayload = (text: string): string => {
  const commandMatch = text.match(/^\/\S+\s*(.*)$/s);
  return commandMatch?.[1]?.trim() ?? "";
};

export const parseTaskInput = (
  input: string,
  defaultWorkspaceSourcePath: string,
  selectedWorkspaceSourcePath?: string | null,
): { prompt: string; workspaceSourcePath: string } => {
  const [workspaceOverride, promptOverride] = input.includes("::")
    ? input.split(/::(.+)/s)
    : ["", input];

  const prompt = promptOverride.trim();
  if (!prompt) {
    throw new ValidationError("Task prompt cannot be empty");
  }

  const workspaceSourcePath = path.resolve(
    workspaceOverride.trim().length > 0
      ? workspaceOverride.trim()
      : selectedWorkspaceSourcePath ?? defaultWorkspaceSourcePath,
  );

  return { prompt, workspaceSourcePath };
};

const formatTaskKeyboard = (taskId: string): InlineKeyboard =>
  new InlineKeyboard().text("View logs", `logs:${taskId}`).text("Cancel", `cancel:${taskId}`);

const formatRepositoryKeyboard = (repositories: RepositoryOption[]): InlineKeyboard => {
  const keyboard = new InlineKeyboard();
  repositories.forEach((repository, index) => {
    keyboard.text(repository.name, `repo:${repository.index}`);
    if (index % 2 === 1) {
      keyboard.row();
    }
  });
  return keyboard;
};

export const replyChunked = async (ctx: Context, text: string): Promise<void> => {
  for (const chunk of chunkMessage(text, 4096)) {
    await ctx.reply(chunk);
  }
};

export const promptRepositorySelection = async (
  ctx: Context,
  dependencies: TaskCommandDependencies,
): Promise<void> => {
  const repositories = await dependencies.repositoryCatalog.listRepositories();
  if (repositories.length === 0) {
    await replyChunked(
      ctx,
      `在 ${dependencies.config.DEFAULT_WORKSPACE_SOURCE_PATH} 下没有找到任何仓库。`,
    );
    return;
  }

  await replyChunked(
    ctx,
    [
      "请先选择一个仓库。",
      `当前基础目录：${dependencies.config.DEFAULT_WORKSPACE_SOURCE_PATH}`,
      "选中后再发送 /task、/codex、/claude，或直接发送文本任务。",
    ].join("\n"),
  );
  await ctx.reply("可选仓库：", {
    reply_markup: formatRepositoryKeyboard(repositories),
  });
};

export const formatPendingTaskPrompt = (
  agentName: string,
  workspaceSourcePath: string,
): string => {
  const agentLabel =
    agentName === "claude-code"
      ? "Claude Code"
      : agentName === "codex"
        ? "Codex"
        : agentName;

  return `请输入任务内容，下一条文本将使用 ${agentLabel} 执行。\n当前仓库：${workspaceSourcePath}`;
};

const bindTaskStreaming = (
  ctx: Context,
  eventBus: EventBusLike,
  logger: LoggerLike,
  taskId: string,
): void => {
  let sendQueue = Promise.resolve();

  const enqueueReply = (chunk: string): void => {
    sendQueue = sendQueue
      .then(async () => {
        await replyChunked(ctx, chunk);
      })
      .catch((error: unknown) => {
        logger.error({ error, taskId }, "Failed to stream task output to Telegram");
      });
  };

  const unsubscribeOutput = eventBus.on("task:output", ({ taskId: outputTaskId, chunk }) => {
    if (outputTaskId !== taskId) {
      return;
    }

    enqueueReply(chunk);
  });
  const cleanups: Array<() => void> = [];

  const stop = (): void => {
    unsubscribeOutput();
    for (const cleanup of cleanups) {
      cleanup();
    }
    clearTimeout(timeoutId);
  };

  cleanups.push(
    eventBus.on("task:completed", ({ task }) => {
      if (task.id === taskId) {
        stop();
      }
    }),
  );
  cleanups.push(
    eventBus.on("task:failed", ({ task }) => {
      if (task.id === taskId) {
        stop();
      }
    }),
  );
  cleanups.push(
    eventBus.on("task:cancelled", ({ task }) => {
      if (task.id === taskId) {
        stop();
      }
    }),
  );

  const timeoutId = setTimeout(stop, 60 * 60 * 1000);
};

export const createTaskMessageHandler =
  (dependencies: TaskCommandDependencies, forcedAgentName?: string) =>
  async (ctx: Context, rawInput?: string, runtimeForcedAgentName?: string): Promise<void> => {
    const input = rawInput ?? extractCommandPayload(ctx.msg?.text ?? "");
    const userId = ctx.from?.id ?? 0;
    const agentName =
      runtimeForcedAgentName ?? forcedAgentName ?? dependencies.agentRegistry.getDefault().name;
    if (input.trim().length === 0) {
      const workspaceSourcePath =
        dependencies.repositorySelectionStore.getSelectedRepository(userId)
        ?? dependencies.config.DEFAULT_WORKSPACE_SOURCE_PATH;
      dependencies.pendingTaskInputStore.set(userId, agentName);
      await replyChunked(ctx, formatPendingTaskPrompt(agentName, workspaceSourcePath));
      return;
    }

    dependencies.pendingTaskInputStore.clear(userId);
    const selectedWorkspaceSourcePath = dependencies.repositorySelectionStore.getSelectedRepository(
      userId,
    );
    const { prompt, workspaceSourcePath } = parseTaskInput(
      input,
      dependencies.config.DEFAULT_WORKSPACE_SOURCE_PATH,
      selectedWorkspaceSourcePath,
    );

    const task = dependencies.taskStore.createTask({
      userId,
      agentName,
      prompt,
      workspaceSourcePath,
    });

    await dependencies.taskQueue.enqueue(task.id);
    dependencies.eventBus.emit("task:queued", { task });
    bindTaskStreaming(ctx, dependencies.eventBus, dependencies.logger, task.id);

    await ctx.reply(
      `任务已入队 ${task.id}\nAgent：${task.agentName}\n仓库：${task.workspaceSourcePath}`,
      {
        reply_markup: formatTaskKeyboard(task.id),
      },
    );
  };

export const registerTaskCommand = (bot: Bot, dependencies: TaskCommandDependencies): void => {
  bot.command("task", async (ctx) => {
    await createTaskMessageHandler(dependencies)(ctx);
  });
};

export const registerReposCommand = (bot: Bot, dependencies: TaskCommandDependencies): void => {
  bot.command("repos", async (ctx) => {
    await promptRepositorySelection(ctx, dependencies);
  });
};

export const formatLogsReply = (
  taskStore: TaskStore,
  taskId: string,
  limit = DEFAULT_TASK_LOG_LIMIT,
): string => {
  const logs = taskStore.getLogs(taskId, limit);
  if (logs.length === 0) {
    return `任务 ${taskId} 暂无日志。`;
  }

  return logs.map((entry) => entry.content).join("\n");
};
