import { describe, expect, it, vi } from "vitest";

import { registerCallbackQueryHandler } from "../../../src/bot/handlers/callback-query.js";

describe("registerCallbackQueryHandler", () => {
  it("submits a task directly from the publish button and renders a merge button", async () => {
    const on = vi.fn();
    const bot = { on } as never;
    const submitTask = vi.fn(() =>
      Promise.resolve({
        task: {
          id: "task-0",
          workspacePath: "/tmp/task-0",
        },
        branchName: "task/task-0",
        commitHash: "abc000",
        committed: true,
      }),
    );

    registerCallbackQueryHandler(
      bot,
      { getLogs: vi.fn() } as never,
      { submitTask, mergeTask: vi.fn(), pushTask: vi.fn() } as never,
      { cancelTask: vi.fn() } as never,
      {} as never,
      {} as never,
    );

    const handler = on.mock.calls[0]?.[1] as (ctx: unknown) => Promise<void>;
    const answerCallbackQuery = vi.fn(() => Promise.resolve());
    const editMessageText = vi.fn(() => Promise.resolve());

    await handler({
      from: { id: 1 },
      callbackQuery: { data: "publish:run:submit:task-0" },
      answerCallbackQuery,
      editMessageText,
    });

    expect(submitTask).toHaveBeenCalledWith("task-0", 1);
    expect(editMessageText).toHaveBeenCalledWith(
      "已提交本地分支 task-0\n分支：task/task-0\n提交：abc000\nWorktree：/tmp/task-0\n下一步：可点击下方按钮继续合并",
      expect.any(Object),
    );
  });

  it("shows a confirmation prompt before merge", async () => {
    const on = vi.fn();
    const bot = { on } as never;

    registerCallbackQueryHandler(
      bot,
      { getLogs: vi.fn() } as never,
      { submitTask: vi.fn(), mergeTask: vi.fn(), pushTask: vi.fn() } as never,
      { cancelTask: vi.fn() } as never,
      {} as never,
      {} as never,
    );

    const handler = on.mock.calls[0]?.[1] as (ctx: unknown) => Promise<void>;
    const answerCallbackQuery = vi.fn(() => Promise.resolve());
    const reply = vi.fn(() => Promise.resolve());

    await handler({
      callbackQuery: { data: "publish:prompt:merge:task-1" },
      answerCallbackQuery,
      reply,
    });

    expect(answerCallbackQuery).toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      "确认要把任务 task-1 合并到本地 main 吗？",
      expect.any(Object),
    );
  });

  it("executes merge after confirmation and renders a push button", async () => {
    const on = vi.fn();
    const bot = { on } as never;
    const mergeTask = vi.fn(() =>
      Promise.resolve({
        task: { id: "task-1" },
        branchName: "task/task-1",
        commitHash: "abc123",
        merged: true,
      }),
    );

    registerCallbackQueryHandler(
      bot,
      { getLogs: vi.fn() } as never,
      { submitTask: vi.fn(), mergeTask, pushTask: vi.fn() } as never,
      { cancelTask: vi.fn() } as never,
      {} as never,
      {} as never,
    );

    const handler = on.mock.calls[0]?.[1] as (ctx: unknown) => Promise<void>;
    const answerCallbackQuery = vi.fn(() => Promise.resolve());
    const editMessageText = vi.fn(() => Promise.resolve());

    await handler({
      from: { id: 1 },
      callbackQuery: { data: "publish:confirm:merge:task-1" },
      answerCallbackQuery,
      editMessageText,
    });

    expect(mergeTask).toHaveBeenCalledWith("task-1", 1);
    expect(editMessageText).toHaveBeenCalledWith(
      "已合并到本地 main task-1\n分支：task/task-1\n本地 main：abc123\n下一步：可点击下方按钮继续推送",
      expect.any(Object),
    );
  });

  it("cancels a push confirmation and restores the action button", async () => {
    const on = vi.fn();
    const bot = { on } as never;

    registerCallbackQueryHandler(
      bot,
      { getLogs: vi.fn() } as never,
      { submitTask: vi.fn(), mergeTask: vi.fn(), pushTask: vi.fn() } as never,
      { cancelTask: vi.fn() } as never,
      {} as never,
      {} as never,
    );

    const handler = on.mock.calls[0]?.[1] as (ctx: unknown) => Promise<void>;
    const answerCallbackQuery = vi.fn(() => Promise.resolve());
    const editMessageText = vi.fn(() => Promise.resolve());

    await handler({
      callbackQuery: { data: "publish:cancel:push:task-2" },
      answerCallbackQuery,
      editMessageText,
    });

    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "已取消" });
    expect(editMessageText).toHaveBeenCalledWith(
      "已取消推送 task-2",
      expect.any(Object),
    );
  });
});
