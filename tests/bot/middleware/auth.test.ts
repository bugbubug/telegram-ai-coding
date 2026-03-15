import { describe, expect, it, vi } from "vitest";

import { createAuthMiddleware } from "../../../src/bot/middleware/auth.js";

describe("createAuthMiddleware", () => {
  it("allows configured users", async () => {
    const middleware = createAuthMiddleware({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_ALLOWED_USERS: [1],
      CODEX_CLI_PATH: "codex",
      CODEX_CLI_ARGS: [],
      CLAUDE_CODE_CLI_PATH: "claude",
      CLAUDE_CODE_CLI_ARGS: [],
      WORKSPACE_BASE_DIR: "/tmp",
      DEFAULT_WORKSPACE_SOURCE_PATH: "/tmp",
      GIT_BRANCH_ISOLATION: false,
      REDIS_URL: "redis://localhost:6379",
      TASK_CONCURRENCY: 1,
      LOG_LEVEL: "info",
    });
    const reply = vi.fn();
    const next = vi.fn();

    await middleware(
      {
        from: { id: 1 },
        reply,
      } as never,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
  });

  it("rejects unknown users", async () => {
    const middleware = createAuthMiddleware({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_ALLOWED_USERS: [1],
      CODEX_CLI_PATH: "codex",
      CODEX_CLI_ARGS: [],
      CLAUDE_CODE_CLI_PATH: "claude",
      CLAUDE_CODE_CLI_ARGS: [],
      WORKSPACE_BASE_DIR: "/tmp",
      DEFAULT_WORKSPACE_SOURCE_PATH: "/tmp",
      GIT_BRANCH_ISOLATION: false,
      REDIS_URL: "redis://localhost:6379",
      TASK_CONCURRENCY: 1,
      LOG_LEVEL: "info",
    });
    const reply = vi.fn();
    const next = vi.fn();

    await middleware(
      {
        from: { id: 99 },
        reply,
      } as never,
      next,
    );

    expect(reply).toHaveBeenCalledWith("You are not authorized to use this bot.");
    expect(next).not.toHaveBeenCalled();
  });
});
