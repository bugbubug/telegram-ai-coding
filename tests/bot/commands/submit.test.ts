import { describe, expect, it, vi } from "vitest";

import { registerSubmitCommand } from "../../../src/bot/commands/submit.js";

describe("registerSubmitCommand", () => {
  it("submits the latest completed task when task id is omitted", async () => {
    const handlerByCommand = new Map<string, (ctx: unknown) => Promise<void>>();
    const reply = vi.fn(() => Promise.resolve());
    const submitTask = vi.fn(() => ({
      task: {
        id: "task-1",
        workspacePath: "/tmp/task-1",
      },
      branchName: "task/task-1",
      commitHash: "abc123",
      committed: true,
    }));

    const bot = {
      command(command: string, handler: (ctx: unknown) => Promise<void>) {
        handlerByCommand.set(command, handler);
      },
    } as never;

    registerSubmitCommand(
      bot,
      {
        listTasksByUser: vi.fn(() => [{ id: "task-1" }]),
      } as never,
      {
        submitTask,
      } as never,
    );

    await handlerByCommand.get("submit")?.({
      from: { id: 1 },
      msg: { text: "/submit" },
      reply,
    });

    expect(submitTask).toHaveBeenCalledWith("task-1", 1, "");
    expect(reply).toHaveBeenCalledWith(
      "已提交本地分支 task-1\n分支：task/task-1\n提交：abc123\nWorktree：/tmp/task-1",
    );
  });

  it("uses an explicit task id and custom message", async () => {
    const handlerByCommand = new Map<string, (ctx: unknown) => Promise<void>>();
    const submitTask = vi.fn(() => ({
      task: {
        id: "task-2",
        workspacePath: "/tmp/task-2",
      },
      branchName: "task/task-2",
      commitHash: "def456",
      committed: false,
    }));

    const bot = {
      command(command: string, handler: (ctx: unknown) => Promise<void>) {
        handlerByCommand.set(command, handler);
      },
    } as never;

    registerSubmitCommand(
      bot,
      {
        listTasksByUser: vi.fn(() => []),
      } as never,
      {
        submitTask,
      } as never,
    );

    const reply = vi.fn(() => Promise.resolve());
    await handlerByCommand.get("submit")?.({
      from: { id: 8 },
      msg: { text: "/submit task-2 release commit" },
      reply,
    });

    expect(submitTask).toHaveBeenCalledWith("task-2", 8, "release commit");
    expect(reply).toHaveBeenCalledWith(
      "当前没有新的未提交更改 task-2\n分支：task/task-2\n提交：def456\nWorktree：/tmp/task-2",
    );
  });
});
