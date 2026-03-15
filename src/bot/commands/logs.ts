import type { Bot } from "grammy";

import { ValidationError } from "../../core/errors.js";
import type { TaskStore } from "../../services/task/task-store.js";
import { formatLogsReply, replyChunked } from "./task.js";

const extractTaskId = (text: string): string => text.replace(/^\/logs\s*/u, "").trim();

export const registerLogsCommand = (bot: Bot, taskStore: TaskStore): void => {
  bot.command("logs", async (ctx) => {
    const explicitTaskId = extractTaskId(ctx.msg?.text ?? "");
    const taskId = explicitTaskId || taskStore.getLatestTaskForUser(ctx.from?.id ?? 0)?.id;
    if (!taskId) {
      throw new ValidationError("No task found for this user.");
    }

    await replyChunked(ctx, formatLogsReply(taskStore, taskId));
  });
};
