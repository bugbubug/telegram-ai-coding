import { describe, expect, it } from "vitest";

import type {
  AgentSession,
  AgentSpawnOptions,
  EventBusLike,
  EventMap,
} from "../../../src/core/types.js";
import { ClaudeCodeAgent } from "../../../src/services/agent/claude-code-agent.js";
import { CodexAgent } from "../../../src/services/agent/codex-agent.js";
import type { TerminalManager } from "../../../src/services/terminal/terminal-manager.js";

interface CapturedInvocation {
  command: string;
  args: string[];
  cwd: string;
  preferPty?: boolean;
}

const createTerminalManagerStub = (captured: CapturedInvocation[]): TerminalManager =>
  ({
    create(options: {
      command: string;
      args: string[];
      cwd: string;
      env?: NodeJS.ProcessEnv;
      preferPty?: boolean;
      onOutput: (chunk: string) => void;
    }): AgentSession {
      captured.push({
        command: options.command,
        args: options.args,
        cwd: options.cwd,
        preferPty: options.preferPty,
      });

      return {
        id: "session-1",
        status: "running",
        completion: Promise.resolve({
          exitCode: 0,
          signal: null,
          cancelled: false,
        }),
        write(): void {},
        kill(): void {},
        dispose(): void {},
      };
    },
  }) as unknown as TerminalManager;

const createEventBusStub = (): EventBusLike => ({
  emit<K extends keyof EventMap>(eventName: K, payload: EventMap[K]): void {
    void eventName;
    void payload;
  },
  on<K extends keyof EventMap>(eventName: K, listener: (payload: EventMap[K]) => void): () => void {
    void eventName;
    void listener;
    return () => {};
  },
  once<K extends keyof EventMap>(
    eventName: K,
    listener: (payload: EventMap[K]) => void,
  ): () => void {
    void eventName;
    void listener;
    return () => {};
  },
  off<K extends keyof EventMap>(eventName: K, listener: (payload: EventMap[K]) => void): void {
    void eventName;
    void listener;
  },
});

const defaultSpawnOptions: AgentSpawnOptions = {
  taskId: "task-1",
  prompt: "analyze this repository",
  cwd: "/tmp/worktree",
};

describe("CLI agent argument adapters", () => {
  it("uses codex exec non-interactive arguments", async () => {
    const captured: CapturedInvocation[] = [];
    const agent = new CodexAgent(
      createTerminalManagerStub(captured),
      createEventBusStub(),
      "codex",
      [],
    );

    await agent.spawn(defaultSpawnOptions);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      command: "codex",
      args: ["exec", "--full-auto", "analyze this repository"],
      cwd: "/tmp/worktree",
      preferPty: true,
    });
  });

  it("uses claude print-mode arguments", async () => {
    const captured: CapturedInvocation[] = [];
    const agent = new ClaudeCodeAgent(
      createTerminalManagerStub(captured),
      createEventBusStub(),
      "claude",
      [],
    );

    await agent.spawn(defaultSpawnOptions);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      command: "claude",
      args: ["--print", "analyze this repository"],
      cwd: "/tmp/worktree",
      preferPty: false,
    });
  });

  it("preserves configured extra arguments ahead of runtime prompt args", async () => {
    const captured: CapturedInvocation[] = [];
    const agent = new CodexAgent(
      createTerminalManagerStub(captured),
      createEventBusStub(),
      "codex",
      ["--color", "never"],
    );

    await agent.spawn(defaultSpawnOptions);

    expect(captured[0]?.args).toEqual([
      "--color",
      "never",
      "exec",
      "--full-auto",
      "analyze this repository",
    ]);
  });
});
