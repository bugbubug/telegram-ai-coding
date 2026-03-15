import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node-pty", () => ({
  spawn: vi.fn(),
}));

import * as pty from "node-pty";

import {
  isProcessAlive,
  sanitizeSpawnEnv,
  TerminalSession,
} from "../../../src/services/terminal/session.js";
import { TERMINAL_EXIT_POLL_MS } from "../../../src/shared/constants.js";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("sanitizeSpawnEnv", () => {
  it("drops undefined values before spawning processes", () => {
    expect(
      sanitizeSpawnEnv({
        GOOD: "value",
        BAD: undefined,
      }),
    ).toEqual({
      GOOD: "value",
    });
  });
});

describe("isProcessAlive", () => {
  it("returns false for missing pids", () => {
    expect(isProcessAlive(undefined)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
  });
});

describe("TerminalSession", () => {
  it("fails the session when the underlying process disappears without an exit event", async () => {
    vi.useFakeTimers();

    const fakePty = {
      pid: 999999,
      write: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
    };
    vi.mocked(pty.spawn).mockReturnValue(fakePty as never);

    const session = new TerminalSession({
      command: "codex",
      args: ["exec", "--full-auto", "hello"],
      cwd: process.cwd(),
      onOutput: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(TERMINAL_EXIT_POLL_MS + 10);

    const completion = await session.completion;
    expect(session.status).toBe("failed");
    expect(completion.cancelled).toBe(false);
    expect(completion.error?.message).toContain("exited without an exit event");

    session.dispose();
  });
});
