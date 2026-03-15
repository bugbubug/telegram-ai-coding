import { spawn as spawnChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { IPty } from "node-pty";
import * as pty from "node-pty";

import {
  DEFAULT_PTY_COLS,
  DEFAULT_PTY_ROWS,
  TERMINAL_EXIT_POLL_MS,
} from "../../shared/constants.js";
import { generateId } from "../../shared/utils.js";
import type {
  AgentCompletionResult,
  AgentSession,
  AgentSessionStatus,
} from "../../core/types.js";
import { TerminalError } from "../../core/errors.js";
import { OutputBuffer } from "./output-buffer.js";

export interface TerminalSessionOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onOutput: (chunk: string) => void;
}

type TerminalProcess = IPty | ChildProcessWithoutNullStreams;

const getProcessPid = (processHandle: TerminalProcess): number | undefined => {
  if ("pid" in processHandle && typeof processHandle.pid === "number") {
    return processHandle.pid;
  }

  return undefined;
};

export const isProcessAlive = (pid: number | undefined): boolean => {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const sanitizeSpawnEnv = (
  env: NodeJS.ProcessEnv | undefined,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

export class TerminalSession implements AgentSession {
  public readonly id = generateId();
  public status: AgentSessionStatus = "running";
  public readonly completion: Promise<AgentCompletionResult>;

  private readonly process: TerminalProcess;
  private readonly outputBuffer: OutputBuffer;
  private cancelled = false;
  private resolveCompletion!: (result: AgentCompletionResult) => void;
  private completed = false;
  private readonly usesPty: boolean;
  private readonly ptyProcess: IPty | null;
  private readonly childProcess: ChildProcessWithoutNullStreams | null;
  private readonly processPid: number | undefined;
  private readonly exitPollTimer: NodeJS.Timeout;

  public constructor(private readonly options: TerminalSessionOptions) {
    this.outputBuffer = new OutputBuffer(options.onOutput);
    this.completion = new Promise<AgentCompletionResult>((resolve) => {
      this.resolveCompletion = resolve;
    });

    const env = sanitizeSpawnEnv({
      ...process.env,
      ...options.env,
    });

    try {
      this.process = pty.spawn(options.command, options.args, {
        name: "xterm-color",
        cols: DEFAULT_PTY_COLS,
        rows: DEFAULT_PTY_ROWS,
        cwd: options.cwd,
        env,
      });
      this.usesPty = true;
      this.ptyProcess = this.process;
      this.childProcess = null;
      this.processPid = getProcessPid(this.process);
    } catch (error) {
      this.process = spawnChildProcess(options.command, options.args, {
        cwd: options.cwd,
        env,
      });
      this.usesPty = false;
      this.ptyProcess = null;
      this.childProcess = this.process;
      this.processPid = getProcessPid(this.process);
      this.exitPollTimer = this.startExitPoll();
      this.bindChildProcess(this.process, error);
      return;
    }

    this.exitPollTimer = this.startExitPoll();
    this.bindPtyProcess(this.process);
  }

  public write(input: string): void {
    if (this.usesPty && this.ptyProcess) {
      this.ptyProcess.write(input);
      return;
    }

    this.childProcess?.stdin.write(input);
  }

  public kill(): void {
    if (this.completed) {
      return;
    }

    this.cancelled = true;
    this.process.kill();
  }

  public dispose(): void {
    clearInterval(this.exitPollTimer);
    this.outputBuffer.dispose();
    if (!this.completed) {
      this.kill();
    }
  }

  private finish(result: AgentCompletionResult): void {
    if (this.completed) {
      return;
    }

    this.completed = true;
    clearInterval(this.exitPollTimer);
    this.resolveCompletion(result);
  }

  private startExitPoll(): NodeJS.Timeout {
    return setInterval(() => {
      if (this.completed || isProcessAlive(this.processPid)) {
        return;
      }

      this.outputBuffer.flush();
      this.status = this.cancelled ? "cancelled" : "failed";
      this.finish({
        exitCode: null,
        signal: null,
        cancelled: this.cancelled,
        error: this.cancelled
          ? undefined
          : new TerminalError(`Process for ${this.options.command} exited without an exit event`),
      });
    }, TERMINAL_EXIT_POLL_MS);
  }

  private bindPtyProcess(processHandle: IPty): void {
    processHandle.onData((data) => {
      this.outputBuffer.append(data);
    });

    processHandle.onExit(({ exitCode, signal }) => {
      this.outputBuffer.flush();
      this.status = this.cancelled
        ? "cancelled"
        : exitCode === 0
          ? "completed"
          : "failed";
      this.finish({
        exitCode,
        signal: signal ?? null,
        cancelled: this.cancelled,
      });
    });
  }

  private bindChildProcess(
    processHandle: ChildProcessWithoutNullStreams,
    originalError: unknown,
  ): void {
    processHandle.stdout.on("data", (data: Buffer) => {
      this.outputBuffer.append(data.toString("utf8"));
    });
    processHandle.stderr.on("data", (data: Buffer) => {
      this.outputBuffer.append(data.toString("utf8"));
    });
    processHandle.on("error", (error) => {
      this.outputBuffer.flush();
      this.status = "failed";
      this.finish({
        exitCode: null,
        signal: null,
        cancelled: this.cancelled,
        error: new TerminalError(
          `Failed to spawn PTY for ${this.options.command}`,
          error ?? originalError,
        ),
      });
    });
    processHandle.on("close", (exitCode, signal) => {
      if (this.completed) {
        return;
      }

      this.outputBuffer.flush();
      this.status = this.cancelled
        ? "cancelled"
        : exitCode === 0
          ? "completed"
          : "failed";
      this.finish({
        exitCode,
        signal: typeof signal === "number" ? signal : null,
        cancelled: this.cancelled,
      });
    });
    processHandle.on("exit", (exitCode, signal) => {
      if (this.completed) {
        return;
      }

      this.outputBuffer.flush();
      this.status = this.cancelled
        ? "cancelled"
        : exitCode === 0
          ? "completed"
          : "failed";
      this.finish({
        exitCode,
        signal: typeof signal === "number" ? signal : null,
        cancelled: this.cancelled,
      });
    });
  }
}
