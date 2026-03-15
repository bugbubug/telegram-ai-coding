import { Bot } from "grammy";

import type { AppConfig } from "../config/index.js";
import type { CommandRegistry, EventBusLike, LoggerLike } from "../core/types.js";
import type { ITaskQueue } from "../services/task/task-queue.js";
import type { AgentRegistry } from "../services/agent/agent-registry.js";
import type { TaskRunner } from "../services/task/task-runner.js";
import type { TaskStore } from "../services/task/task-store.js";
import { createTaskMessageHandler, registerTaskCommand } from "./commands/task.js";
import { registerStartCommand } from "./commands/start.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerLogsCommand } from "./commands/logs.js";
import { registerCancelCommand } from "./commands/cancel.js";
import { registerCallbackQueryHandler } from "./handlers/callback-query.js";
import { registerMessageHandler } from "./handlers/message.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createErrorHandler } from "./middleware/error-handler.js";

interface CreateBotOptions {
  config: AppConfig;
  logger: LoggerLike;
  eventBus: EventBusLike;
  taskStore: TaskStore;
  taskQueue: ITaskQueue;
  taskRunner: TaskRunner;
  agentRegistry: AgentRegistry;
  commandRegistry: CommandRegistry;
}

export const createBot = (options: CreateBotOptions): Bot => {
  const bot = new Bot(options.config.TELEGRAM_BOT_TOKEN);
  bot.use(createAuthMiddleware(options.config));
  bot.catch(createErrorHandler(options.logger));

  const taskDependencies = {
    config: options.config,
    eventBus: options.eventBus,
    taskStore: options.taskStore,
    taskQueue: options.taskQueue,
    agentRegistry: options.agentRegistry,
  };

  registerStartCommand(bot, options.commandRegistry);
  registerTaskCommand(bot, taskDependencies);
  registerStatusCommand(bot, options.taskStore);
  registerLogsCommand(bot, options.taskStore);
  registerCancelCommand(bot, options.taskRunner, options.taskStore);
  registerCallbackQueryHandler(bot, options.taskStore, options.taskRunner);
  registerMessageHandler(bot, createTaskMessageHandler(taskDependencies));

  for (const command of options.commandRegistry.listAgentCommands()) {
    bot.command(command.name, async (ctx) => {
      await createTaskMessageHandler(taskDependencies, command.agentName)(ctx);
    });
  }

  return bot;
};
