import { InlineKeyboard } from "grammy";

import { ValidationError } from "../../core/errors.js";
import type {
  TaskMergerResult,
  TaskPublisher,
  TaskPushResult,
  TaskSubmitResult,
} from "../../services/task/task-publisher.js";

export const extractTaskPayload = (text: string, commandName: string): string => {
  const pattern = new RegExp(`^/${commandName}\\s*`, "u");
  return text.replace(pattern, "").trim();
};

export const extractSubmitPayload = (
  text: string,
): { taskId: string; commitMessage: string } => {
  const payload = extractTaskPayload(text, "submit");
  if (payload.length === 0) {
    return { taskId: "", commitMessage: "" };
  }

  const [taskId, ...messageParts] = payload.split(/\s+/u);
  return {
    taskId,
    commitMessage: messageParts.join(" ").trim(),
  };
};

export const extractSingleTaskId = (text: string, commandName: string): string =>
  extractTaskPayload(text, commandName).split(/\s+/u).filter(Boolean).at(0) ?? "";

export const resolveTaskIdForAction = async (
  explicitTaskId: string,
  userId: number,
  taskPublisher: TaskPublisher,
  action: "submit" | "merge" | "push",
): Promise<string> => {
  if (explicitTaskId) {
    return explicitTaskId;
  }

  const fallbackTaskId = await taskPublisher.findLatestTaskIdForAction(userId, action);
  if (!fallbackTaskId) {
    throw new ValidationError(`No completed task found to ${action}.`);
  }

  return fallbackTaskId;
};

export const formatSubmitReply = (result: TaskSubmitResult): string => {
  const actionLine = result.committed ? "已提交本地分支" : "当前没有新的未提交更改";

  return [
    `${actionLine} ${result.task.id}`,
    `分支：${result.branchName}`,
    `提交：${result.commitHash}`,
    `Worktree：${result.task.workspacePath ?? "无"}`,
    `下一步：可点击下方按钮继续合并`,
  ].join("\n");
};

export const formatMergeReply = (result: TaskMergerResult): string => {
  const actionLine = result.merged ? "已合并到本地 main" : "任务分支已在本地 main 中";

  return [
    `${actionLine} ${result.task.id}`,
    `分支：${result.branchName}`,
    `本地 main：${result.commitHash}`,
    "下一步：可点击下方按钮继续推送",
  ].join("\n");
};

export const formatPushReply = (result: TaskPushResult): string => {
  const actionLine =
    result.cleanup.status === "failed"
      ? "已推送到 origin/main，但 worktree 清理失败"
      : "已推送到 origin/main";

  return [
    `${actionLine} ${result.task.id}`,
    `分支：${result.branchName}`,
    `本地 main：${result.commitHash}`,
    "远端：origin/main",
    `Worktree 清理：${result.cleanup.message}`,
  ].join("\n");
};

export const formatActionConfirmationPrompt = (
  action: "merge" | "push",
  taskId: string,
): string =>
  action === "merge"
    ? `确认要把任务 ${taskId} 合并到本地 main 吗？`
    : `确认要把本地 main 推送到 origin/main，并在成功后清理任务 ${taskId} 的本地 worktree 吗？`;

export const buildActionKeyboard = (
  action: "submit" | "merge" | "push",
  taskId: string,
): InlineKeyboard =>
  new InlineKeyboard().text(
    action === "submit"
      ? "提交分支"
      : action === "merge"
        ? "合并到 main"
        : "推送到 origin/main",
    action === "submit" ? `publish:run:submit:${taskId}` : `publish:prompt:${action}:${taskId}`,
  );

export const buildConfirmationKeyboard = (
  action: "merge" | "push",
  taskId: string,
): InlineKeyboard =>
  new InlineKeyboard()
    .text("确认", `publish:confirm:${action}:${taskId}`)
    .text("取消", `publish:cancel:${action}:${taskId}`);
