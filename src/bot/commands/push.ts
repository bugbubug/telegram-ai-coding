import type { Bot } from "grammy";

import type { TaskPublisher } from "../../services/task/task-publisher.js";
import { extractSingleTaskId, resolveTaskIdForAction } from "./publish-command-utils.js";
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
    const actionLine =
      result.cleanup.status === "failed"
        ? "已推送到 origin/main，但 worktree 清理失败"
        : "已推送到 origin/main";

    await replyChunked(
      ctx,
      [
        `${actionLine} ${result.task.id}`,
        `分支：${result.branchName}`,
        `本地 main：${result.commitHash}`,
        "远端：origin/main",
        `Worktree 清理：${result.cleanup.message}`,
      ].join("\n"),
    );
  });
};
