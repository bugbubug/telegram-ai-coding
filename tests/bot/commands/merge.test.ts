import { describe, expect, it, vi } from "vitest";

import { registerMergeCommand } from "../../../src/bot/commands/merge.js";

describe("registerMergeCommand", () => {
  it("merges the latest available task when task id is omitted", async () => {
    const handlerByCommand = new Map<string, (ctx: unknown) => Promise<void>>();
    const reply = vi.fn(() => Promise.resolve());
    const mergeTask = vi.fn(() => ({
      task: { id: "task-1" },
      branchName: "task/task-1",
      commitHash: "abc123",
      merged: true,
    }));
    const findLatestTaskIdForAction = vi.fn(() => Promise.resolve("task-1"));

    const bot = {
      command(command: string, handler: (ctx: unknown) => Promise<void>) {
        handlerByCommand.set(command, handler);
      },
    } as never;

    registerMergeCommand(
      bot,
      {
        findLatestTaskIdForAction,
        mergeTask,
      } as never,
    );

    await handlerByCommand.get("merge")?.({
      from: { id: 1 },
      msg: { text: "/merge" },
      reply,
    });

    expect(findLatestTaskIdForAction).toHaveBeenCalledWith(1, "merge");
    expect(mergeTask).toHaveBeenCalledWith("task-1", 1);
    expect(reply).toHaveBeenCalledWith(
      "已合并到本地 main task-1\n分支：task/task-1\n本地 main：abc123\n下一步：/push task-1",
    );
  });

  it("shows an idempotent message when the task branch is already merged", async () => {
    const handlerByCommand = new Map<string, (ctx: unknown) => Promise<void>>();
    const reply = vi.fn(() => Promise.resolve());

    const bot = {
      command(command: string, handler: (ctx: unknown) => Promise<void>) {
        handlerByCommand.set(command, handler);
      },
    } as never;

    registerMergeCommand(
      bot,
      {
        findLatestTaskIdForAction: vi.fn(),
        mergeTask: vi.fn(() => ({
          task: { id: "task-2" },
          branchName: "task/task-2",
          commitHash: "def456",
          merged: false,
        })),
      } as never,
    );

    await handlerByCommand.get("merge")?.({
      from: { id: 9 },
      msg: { text: "/merge task-2" },
      reply,
    });

    expect(reply).toHaveBeenCalledWith(
      "任务分支已在本地 main 中 task-2\n分支：task/task-2\n本地 main：def456\n下一步：/push task-2",
    );
  });
});
