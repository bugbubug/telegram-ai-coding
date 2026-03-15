import { describe, expect, it, vi } from "vitest";

import {
  createTaskMessageHandler,
  formatPendingTaskPrompt,
  parseTaskInput,
} from "../../../src/bot/commands/task.js";
import { PendingTaskInputStore } from "../../../src/bot/pending-task-input-store.js";
import { RepositorySelectionStore } from "../../../src/bot/repository-selection-store.js";
import type { LoggerLike } from "../../../src/core/types.js";

describe("parseTaskInput", () => {
  it("uses the default workspace when no override is provided", () => {
    expect(parseTaskInput("hello world", "/tmp/default")).toEqual({
      prompt: "hello world",
      workspaceSourcePath: "/tmp/default",
    });
  });

  it("uses the selected repository when no explicit override is provided", () => {
    expect(parseTaskInput("hello world", "/tmp/default", "/tmp/selected")).toEqual({
      prompt: "hello world",
      workspaceSourcePath: "/tmp/selected",
    });
  });

  it("supports explicit workspace overrides", () => {
    expect(parseTaskInput("/tmp/project::fix bug", "/tmp/default")).toEqual({
      prompt: "fix bug",
      workspaceSourcePath: "/tmp/project",
    });
  });

  it("formats a pending task prompt for claude two-step input", () => {
    expect(formatPendingTaskPrompt("claude-code", "/tmp/project")).toBe(
      "请输入任务内容，下一条文本将使用 Claude Code 执行。\n当前仓库：/tmp/project",
    );
  });

  it("stores pending agent input when command payload is empty", async () => {
    const pendingTaskInputStore = new PendingTaskInputStore();
    const repositorySelectionStore = new RepositorySelectionStore();
    repositorySelectionStore.setSelectedRepository(1, "/tmp/selected");

    const handler = createTaskMessageHandler(
      {
        config: {
          DEFAULT_WORKSPACE_SOURCE_PATH: "/tmp/default",
        } as never,
        eventBus: {
          emit: vi.fn(),
          on: vi.fn(() => () => undefined),
          once: vi.fn(() => () => undefined),
          off: vi.fn(),
        },
        logger: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        } satisfies LoggerLike,
        taskStore: {
          createTask: vi.fn(),
        } as never,
        taskQueue: {
          enqueue: vi.fn(),
        } as never,
        agentRegistry: {
          getDefault: () => ({ name: "codex" }),
        } as never,
        pendingTaskInputStore,
        repositoryCatalog: {} as never,
        repositorySelectionStore,
      },
      "claude-code",
    );

    const reply = vi.fn(() => Promise.resolve());
    await handler(
      {
        from: { id: 1 },
        msg: { text: "/claude" },
        reply,
      } as never,
    );

    expect(pendingTaskInputStore.get(1)?.agentName).toBe("claude-code");
    expect(reply).toHaveBeenCalledWith(
      "请输入任务内容，下一条文本将使用 Claude Code 执行。\n当前仓库：/tmp/selected",
    );
  });
});
