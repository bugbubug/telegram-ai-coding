import type { Bot } from "grammy";

import type { TaskPublisher } from "../../services/task/task-publisher.js";
import { extractSingleTaskId, resolveTaskIdForAction } from "./publish-command-utils.js";
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
    const actionLine = result.merged ? "已合并到本地 main" : "任务分支已在本地 main 中";

    await replyChunked(
      ctx,
      [
        `${actionLine} ${result.task.id}`,
        `分支：${result.branchName}`,
        `本地 main：${result.commitHash}`,
        `下一步：/push ${result.task.id}`,
      ].join("\n"),
    );
  });
};
