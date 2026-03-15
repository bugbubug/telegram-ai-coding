import type { Bot } from "grammy";

import type { TaskPublisher } from "../../services/task/task-publisher.js";
import { replyChunked } from "./task.js";
import {
  buildActionKeyboard,
  extractSubmitPayload,
  formatSubmitReply,
  resolveTaskIdForAction,
} from "./publish-command-utils.js";

export const registerSubmitCommand = (
  bot: Bot,
  taskPublisher: TaskPublisher,
): void => {
  bot.command("submit", async (ctx) => {
    const { taskId: explicitTaskId, commitMessage } = extractSubmitPayload(ctx.msg?.text ?? "");
    const taskId = await resolveTaskIdForAction(
      explicitTaskId,
      ctx.from?.id ?? 0,
      taskPublisher,
      "submit",
    );
    const result = await taskPublisher.submitTask(taskId, ctx.from?.id ?? 0, commitMessage);
    await replyChunked(ctx, formatSubmitReply(result));
    await ctx.reply("发布操作：", {
      reply_markup: buildActionKeyboard("merge", result.task.id),
    });
  });
};
