import { describe, expect, it, vi } from "vitest";

import { registerPushCommand } from "../../../src/bot/commands/push.js";

describe("registerPushCommand", () => {
  it("pushes the latest available task when task id is omitted", async () => {
    const handlerByCommand = new Map<string, (ctx: unknown) => Promise<void>>();
    const reply = vi.fn(() => Promise.resolve());
    const pushTask = vi.fn(() => ({
      task: { id: "task-1" },
      branchName: "task/task-1",
      commitHash: "abc123",
      cleanup: {
        status: "removed",
        message: "任务 worktree 已删除",
      },
    }));
    const findLatestTaskIdForAction = vi.fn(() => Promise.resolve("task-1"));

    const bot = {
      command(command: string, handler: (ctx: unknown) => Promise<void>) {
        handlerByCommand.set(command, handler);
      },
    } as never;

    registerPushCommand(
      bot,
      {
        findLatestTaskIdForAction,
        pushTask,
      } as never,
    );

    await handlerByCommand.get("push")?.({
      from: { id: 1 },
      msg: { text: "/push" },
      reply,
    });

    expect(findLatestTaskIdForAction).toHaveBeenCalledWith(1, "push");
    expect(pushTask).toHaveBeenCalledWith("task-1", 1);
    expect(reply).toHaveBeenCalledWith(
      "已推送到 origin/main task-1\n分支：task/task-1\n本地 main：abc123\n远端：origin/main\nWorktree 清理：任务 worktree 已删除",
    );
  });

  it("reports partial success when cleanup fails after push", async () => {
    const handlerByCommand = new Map<string, (ctx: unknown) => Promise<void>>();
    const reply = vi.fn(() => Promise.resolve());

    const bot = {
      command(command: string, handler: (ctx: unknown) => Promise<void>) {
        handlerByCommand.set(command, handler);
      },
    } as never;

    registerPushCommand(
      bot,
      {
        findLatestTaskIdForAction: vi.fn(),
        pushTask: vi.fn(() => ({
          task: { id: "task-2" },
          branchName: "task/task-2",
          commitHash: "def456",
          cleanup: {
            status: "failed",
            message: "无法删除保留的 worktree",
          },
        })),
      } as never,
    );

    await handlerByCommand.get("push")?.({
      from: { id: 8 },
      msg: { text: "/push task-2" },
      reply,
    });

    expect(reply).toHaveBeenCalledWith(
      "已推送到 origin/main，但 worktree 清理失败 task-2\n分支：task/task-2\n本地 main：def456\n远端：origin/main\nWorktree 清理：无法删除保留的 worktree",
    );
  });
});
