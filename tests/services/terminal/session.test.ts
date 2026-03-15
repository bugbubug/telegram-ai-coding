import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node-pty", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import * as pty from "node-pty";
import { spawn as spawnChildProcess } from "node:child_process";

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

  it("uses child_process when PTY is disabled for the session", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const fakeChild = Object.assign(new EventEmitter(), {
      pid: 123456,
      stdout,
      stderr,
      stdin: {
        end: vi.fn(),
        write: vi.fn(),
      },
      kill: vi.fn(),
    });
    const onOutput = vi.fn();

    vi.mocked(spawnChildProcess).mockReturnValue(fakeChild as never);

    const session = new TerminalSession({
      command: "claude",
      args: ["--print", "hello"],
      cwd: process.cwd(),
      preferPty: false,
      closeStdinOnStart: true,
      onOutput,
    });

    stdout.write("ok");
    stdout.end();
    fakeChild.emit("close", 0, null);

    const completion = await session.completion;

    expect(pty.spawn).not.toHaveBeenCalled();
    expect(spawnChildProcess).toHaveBeenCalledWith(
      "claude",
      ["--print", "hello"],
      expect.objectContaining({
        cwd: process.cwd(),
      }),
    );
    expect(fakeChild.stdin.end).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenCalledWith("ok");
    expect(completion.exitCode).toBe(0);

    session.dispose();
  });
});
