import type { Bot } from "grammy";

import type { TaskPublisher } from "../../services/task/task-publisher.js";
import { replyChunked } from "./task.js";
import { extractSubmitPayload, resolveTaskIdForAction } from "./publish-command-utils.js";

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
    const actionLine = result.committed ? "已提交本地分支" : "当前没有新的未提交更改";

    await replyChunked(
      ctx,
      [
        `${actionLine} ${result.task.id}`,
        `分支：${result.branchName}`,
        `提交：${result.commitHash}`,
        `Worktree：${result.task.workspacePath ?? "无"}`,
        `下一步：/merge ${result.task.id}`,
      ].join("\n"),
    );
  });
};
