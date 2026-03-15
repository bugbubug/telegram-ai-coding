import type { Bot } from "grammy";

import type { TaskRunner } from "../../services/task/task-runner.js";
import type { TaskStore } from "../../services/task/task-store.js";
import { formatLogsReply, replyChunked } from "../commands/task.js";

export const registerCallbackQueryHandler = (
  bot: Bot,
  taskStore: TaskStore,
  taskRunner: TaskRunner,
): void => {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("logs:")) {
      const taskId = data.slice("logs:".length);
      await ctx.answerCallbackQuery();
      await replyChunked(ctx, formatLogsReply(taskStore, taskId));
      return;
    }

    if (data.startsWith("cancel:")) {
      const taskId = data.slice("cancel:".length);
      await taskRunner.cancelTask(taskId);
      await ctx.answerCallbackQuery({ text: `Cancelled ${taskId}` });
    }
  });
};
