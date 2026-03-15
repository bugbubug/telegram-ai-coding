import path from "node:path";

import type { Bot } from "grammy";

import type { Task } from "../../core/types.js";
import type { RepositorySelectionStore } from "../repository-selection-store.js";
import type { TaskStore } from "../../services/task/task-store.js";
import { replyChunked } from "./task.js";

const formatSelectedRepository = (selectedRepositoryPath: string | null): string =>
  selectedRepositoryPath
    ? `当前已选仓库：${path.basename(selectedRepositoryPath)}\n路径：${selectedRepositoryPath}`
    : "当前未选择仓库，请先使用 /repos 选择。";

const formatActiveTask = (task: Task): string =>
  [
    `任务：${task.id}`,
    `状态：${task.status}`,
    `Agent：${task.agentName}`,
    `仓库：${task.workspaceSourcePath}`,
    `Worktree：${task.workspacePath ?? "尚未创建"}`,
    `最近错误：${task.errorMessage ?? "无"}`,
    `更新时间：${task.updatedAt}`,
    `任务内容：${task.prompt}`,
  ].join("\n");

export const formatStatusReply = (
  selectedRepositoryPath: string | null,
  tasks: Task[],
): string => {
  const sections = [formatSelectedRepository(selectedRepositoryPath)];

  if (tasks.length === 0) {
    sections.push("当前没有排队中或运行中的任务。");
    return sections.join("\n\n");
  }

  sections.push(tasks.map((task) => formatActiveTask(task)).join("\n\n"));
  return sections.join("\n\n");
};

export const registerStatusCommand = (
  bot: Bot,
  taskStore: TaskStore,
  repositorySelectionStore: RepositorySelectionStore,
): void => {
  bot.command("status", async (ctx) => {
    const tasks = taskStore.listTasksByUser(ctx.from?.id ?? 0, ["queued", "running"]);
    const selectedRepository = repositorySelectionStore.getSelectedRepository(ctx.from?.id ?? 0);
    await replyChunked(ctx, formatStatusReply(selectedRepository, tasks));
  });
};
