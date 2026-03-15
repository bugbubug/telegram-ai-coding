import { Bot } from "grammy";
import type { BotCommand } from "grammy/types";

import type { AppConfig } from "../config/index.js";
import type { CommandRegistry, EventBusLike, LoggerLike } from "../core/types.js";
import type { ITaskQueue } from "../services/task/task-queue.js";
import type { AgentRegistry } from "../services/agent/agent-registry.js";
import type { TaskRunner } from "../services/task/task-runner.js";
import type { TaskStore } from "../services/task/task-store.js";
import type { RepositoryCatalog } from "../services/workspace/repository-catalog.js";
import { createTaskMessageHandler, registerReposCommand, registerTaskCommand } from "./commands/task.js";
import { registerStartCommand } from "./commands/start.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerLogsCommand } from "./commands/logs.js";
import { registerCancelCommand } from "./commands/cancel.js";
import { registerClearCommand, registerResetCommand } from "./commands/clear.js";
import { registerCallbackQueryHandler } from "./handlers/callback-query.js";
import { registerMessageHandler } from "./handlers/message.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createMessageTrackerMiddleware } from "./middleware/message-tracker.js";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.js";
import type { MessageHistoryStore } from "./message-history-store.js";
import type { PendingTaskInputStore } from "./pending-task-input-store.js";
import type { RepositorySelectionStore } from "./repository-selection-store.js";

interface CreateBotOptions {
  config: AppConfig;
  logger: LoggerLike;
  eventBus: EventBusLike;
  taskStore: TaskStore;
  taskQueue: ITaskQueue;
  taskRunner: TaskRunner;
  agentRegistry: AgentRegistry;
  commandRegistry: CommandRegistry;
  messageHistoryStore: MessageHistoryStore;
  pendingTaskInputStore: PendingTaskInputStore;
  repositoryCatalog: RepositoryCatalog;
  repositorySelectionStore: RepositorySelectionStore;
}

export const buildBotCommands = (commandRegistry: CommandRegistry): BotCommand[] => [
  { command: "start", description: "显示可用命令" },
  {
    command: "repos",
    description: "选择工作目录下的仓库",
  },
  { command: "task", description: "在已选仓库中创建任务" },
  { command: "status", description: "查看排队中和运行中的任务" },
  { command: "logs", description: "查看任务最近日志" },
  { command: "cancel", description: "取消排队中或运行中的任务" },
  { command: "clear", description: "清空当前聊天中的机器人消息" },
  { command: "reset", description: "重置当前会话并取消活跃任务" },
  ...commandRegistry.listAgentCommands().map((command) => ({
    command: command.name,
    description: command.description,
  })),
];

export const createBot = (options: CreateBotOptions): Bot => {
  const bot = new Bot(options.config.TELEGRAM_BOT_TOKEN);
  bot.use(createMessageTrackerMiddleware(options.messageHistoryStore, options.logger));
  bot.use(createRequestLoggerMiddleware(options.logger));
  bot.use(createAuthMiddleware(options.config));
  bot.catch(createErrorHandler(options.logger));

  const taskDependencies = {
    config: options.config,
    eventBus: options.eventBus,
    logger: options.logger,
    taskStore: options.taskStore,
    taskQueue: options.taskQueue,
    agentRegistry: options.agentRegistry,
    pendingTaskInputStore: options.pendingTaskInputStore,
    repositoryCatalog: options.repositoryCatalog,
    repositorySelectionStore: options.repositorySelectionStore,
  };

  registerStartCommand(bot, options.commandRegistry, options.repositorySelectionStore);
  registerReposCommand(bot, taskDependencies);
  registerTaskCommand(bot, taskDependencies);
  registerStatusCommand(bot, options.taskStore, options.repositorySelectionStore);
  registerLogsCommand(bot, options.taskStore);
  registerCancelCommand(bot, options.taskRunner, options.taskStore);
  registerClearCommand(
    bot,
    options.messageHistoryStore,
    options.repositorySelectionStore,
    options.pendingTaskInputStore,
    options.taskRunner,
    options.logger,
  );
  registerResetCommand(
    bot,
    options.messageHistoryStore,
    options.repositorySelectionStore,
    options.pendingTaskInputStore,
    options.taskRunner,
    options.logger,
  );
  registerCallbackQueryHandler(
    bot,
    options.taskStore,
    options.taskRunner,
    options.repositoryCatalog,
    options.repositorySelectionStore,
  );

  for (const command of options.commandRegistry.listAgentCommands()) {
    bot.command(command.name, async (ctx) => {
      await createTaskMessageHandler(taskDependencies, command.agentName)(ctx);
    });
  }

  registerMessageHandler(
    bot,
    createTaskMessageHandler(taskDependencies),
    options.pendingTaskInputStore,
  );

  void bot.api.setMyCommands(buildBotCommands(options.commandRegistry));

  return bot;
};
