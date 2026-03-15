import type { Bot } from "grammy";

import { ValidationError } from "../../core/errors.js";
import type { TaskStore } from "../../services/task/task-store.js";
import type { TaskSubmitter } from "../../services/task/task-submitter.js";
import { replyChunked } from "./task.js";

const extractSubmitPayload = (text: string): { taskId: string; commitMessage: string } => {
  const payload = text.replace(/^\/submit\s*/u, "").trim();
  if (payload.length === 0) {
    return { taskId: "", commitMessage: "" };
  }

  const [taskId, ...messageParts] = payload.split(/\s+/u);
  return {
    taskId,
    commitMessage: messageParts.join(" ").trim(),
  };
};

export const registerSubmitCommand = (
  bot: Bot,
  taskStore: TaskStore,
  taskSubmitter: TaskSubmitter,
): void => {
  bot.command("submit", async (ctx) => {
    const { taskId: explicitTaskId, commitMessage } = extractSubmitPayload(ctx.msg?.text ?? "");
    const fallbackTaskId =
      taskStore
        .listTasksByUser(ctx.from?.id ?? 0, ["completed"])
        .at(0)?.id ?? "";
    const taskId = explicitTaskId || fallbackTaskId;

    if (!taskId) {
      throw new ValidationError("No completed task found to submit.");
    }

    const result = await taskSubmitter.submitTask(taskId, ctx.from?.id ?? 0, commitMessage);
    const actionLine = result.committed ? "已提交本地分支" : "当前没有新的未提交更改";

    await replyChunked(
      ctx,
      [
        `${actionLine} ${result.task.id}`,
        `分支：${result.branchName}`,
        `提交：${result.commitHash}`,
        `Worktree：${result.task.workspacePath ?? "无"}`,
      ].join("\n"),
    );
  });
};
