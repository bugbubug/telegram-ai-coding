import type { Bot } from "grammy";

import type { TaskPublisher } from "../../services/task/task-publisher.js";
import {
  buildActionKeyboard,
  extractSingleTaskId,
  formatMergeReply,
  resolveTaskIdForAction,
} from "./publish-command-utils.js";
import { replyChunked } from "./task.js";

export const registerMergeCommand = (
  bot: Bot,
  taskPublisher: TaskPublisher,
): void => {
  bot.command("merge", async (ctx) => {
    const explicitTaskId = extractSingleTaskId(ctx.msg?.text ?? "", "merge");
    const taskId = await resolveTaskIdForAction(
      explicitTaskId,
      ctx.from?.id ?? 0,
      taskPublisher,
      "merge",
    );
    const result = await taskPublisher.mergeTask(taskId, ctx.from?.id ?? 0);
    await replyChunked(ctx, formatMergeReply(result));
    await ctx.reply("发布操作：", {
      reply_markup: buildActionKeyboard("push", result.task.id),
    });
  });
};
