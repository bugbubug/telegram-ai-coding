import path from "node:path";

import { InlineKeyboard, type Bot, type Context } from "grammy";

import type { AppConfig } from "../../config/index.js";
import { ValidationError } from "../../core/errors.js";
import type { EventBusLike } from "../../core/types.js";
import { DEFAULT_TASK_LOG_LIMIT } from "../../shared/constants.js";
import { chunkMessage } from "../../shared/utils.js";
import type { AgentRegistry } from "../../services/agent/agent-registry.js";
import type { ITaskQueue } from "../../services/task/task-queue.js";
import type { TaskStore } from "../../services/task/task-store.js";

interface TaskCommandDependencies {
  config: AppConfig;
  eventBus: EventBusLike;
  taskStore: TaskStore;
  taskQueue: ITaskQueue;
  agentRegistry: AgentRegistry;
}

const extractCommandPayload = (text: string): string => {
  const commandMatch = text.match(/^\/\S+\s*(.*)$/s);
  return commandMatch?.[1]?.trim() ?? "";
};

export const parseTaskInput = (
  input: string,
  defaultWorkspaceSourcePath: string,
): { prompt: string; workspaceSourcePath: string } => {
  const [workspaceOverride, promptOverride] = input.includes("::")
    ? input.split(/::(.+)/s)
    : ["", input];

  const prompt = promptOverride.trim();
  if (!prompt) {
    throw new ValidationError("Task prompt cannot be empty");
  }

  const workspaceSourcePath = path.resolve(
    workspaceOverride.trim().length > 0 ? workspaceOverride.trim() : defaultWorkspaceSourcePath,
  );

  return { prompt, workspaceSourcePath };
};

const formatTaskKeyboard = (taskId: string): InlineKeyboard =>
  new InlineKeyboard().text("View logs", `logs:${taskId}`).text("Cancel", `cancel:${taskId}`);

export const replyChunked = async (ctx: Context, text: string): Promise<void> => {
  for (const chunk of chunkMessage(text, 4096)) {
    await ctx.reply(chunk);
  }
};

const bindTaskStreaming = (ctx: Context, eventBus: EventBusLike, taskId: string): void => {
  const unsubscribeOutput = eventBus.on("task:output", ({ taskId: outputTaskId, chunk }) => {
    if (outputTaskId !== taskId) {
      return;
    }

    void replyChunked(ctx, chunk);
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
  async (ctx: Context, rawInput?: string): Promise<void> => {
    const input = rawInput ?? extractCommandPayload(ctx.msg?.text ?? "");
    const { prompt, workspaceSourcePath } = parseTaskInput(
      input,
      dependencies.config.DEFAULT_WORKSPACE_SOURCE_PATH,
    );

    const agentName = forcedAgentName ?? dependencies.agentRegistry.getDefault().name;
    const task = dependencies.taskStore.createTask({
      userId: ctx.from?.id ?? 0,
      agentName,
      prompt,
      workspaceSourcePath,
    });

    await dependencies.taskQueue.enqueue(task.id);
    dependencies.eventBus.emit("task:queued", { task });
    bindTaskStreaming(ctx, dependencies.eventBus, task.id);

    await ctx.reply(
      `Queued task ${task.id}\nAgent: ${task.agentName}\nWorkspace: ${task.workspaceSourcePath}`,
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

export const formatLogsReply = (
  taskStore: TaskStore,
  taskId: string,
  limit = DEFAULT_TASK_LOG_LIMIT,
): string => {
  const logs = taskStore.getLogs(taskId, limit);
  if (logs.length === 0) {
    return `No logs found for task ${taskId}.`;
  }

  return logs.map((entry) => entry.content).join("\n");
};
