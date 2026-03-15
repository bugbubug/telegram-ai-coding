import { describe, expect, it } from "vitest";

import { formatStatusReply } from "../../../src/bot/commands/status.js";
import type { Task } from "../../../src/core/types.js";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  userId: 1,
  agentName: "codex",
  prompt: "分析项目结构",
  status: "running",
  workspaceSourcePath: "/Users/bugbubug/Desktop/codex-project/telegram-ai-coding",
  workspacePath: "/Users/bugbubug/Desktop/.telegram-ai-manager-workspaces/task-1",
  errorMessage: null,
  createdAt: "2026-03-15T00:00:00.000Z",
  updatedAt: "2026-03-15T00:00:00.000Z",
  ...overrides,
});

describe("formatStatusReply", () => {
  it("shows selected repository and empty task state", () => {
    expect(
      formatStatusReply("/Users/bugbubug/Desktop/codex-project/telegram-ai-coding", []),
    ).toContain("当前已选仓库：telegram-ai-coding");
  });

  it("shows a hint when no repository is selected", () => {
    expect(formatStatusReply(null, [])).toContain("当前未选择仓库，请先使用 /repos 选择。");
  });

  it("includes active task worktree details", () => {
    const reply = formatStatusReply("/Users/bugbubug/Desktop/codex-project/telegram-ai-coding", [
      createTask(),
    ]);

    expect(reply).toContain("任务：task-1");
    expect(reply).toContain("Worktree：/Users/bugbubug/Desktop/.telegram-ai-manager-workspaces/task-1");
    expect(reply).toContain("最近错误：无");
    expect(reply).toContain("任务内容：分析项目结构");
  });

  it("shows the latest failure reason when present", () => {
    const reply = formatStatusReply("/Users/bugbubug/Desktop/codex-project/telegram-ai-coding", [
      createTask({
        status: "running",
        errorMessage: "Failed to spawn codex",
      }),
    ]);

    expect(reply).toContain("最近错误：Failed to spawn codex");
    expect(reply).toContain("更新时间：2026-03-15T00:00:00.000Z");
  });
});
