import type { Bot } from "grammy";

import type { TaskPublisher } from "../../services/task/task-publisher.js";
import {
  extractSingleTaskId,
  formatPushReply,
  resolveTaskIdForAction,
} from "./publish-command-utils.js";
import { replyChunked } from "./task.js";

export const registerPushCommand = (
  bot: Bot,
  taskPublisher: TaskPublisher,
): void => {
  bot.command("push", async (ctx) => {
    const explicitTaskId = extractSingleTaskId(ctx.msg?.text ?? "", "push");
    const taskId = await resolveTaskIdForAction(
      explicitTaskId,
      ctx.from?.id ?? 0,
      taskPublisher,
      "push",
    );
    const result = await taskPublisher.pushTask(taskId, ctx.from?.id ?? 0);
    await replyChunked(ctx, formatPushReply(result));
  });
};
