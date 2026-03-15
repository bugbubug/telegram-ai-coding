import type { IPty } from "node-pty";
import * as pty from "node-pty";

import {
  DEFAULT_PTY_COLS,
  DEFAULT_PTY_ROWS,
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

export class TerminalSession implements AgentSession {
  public readonly id = generateId();
  public status: AgentSessionStatus = "running";
  public readonly completion: Promise<AgentCompletionResult>;

  private readonly process: IPty;
  private readonly outputBuffer: OutputBuffer;
  private cancelled = false;
  private resolveCompletion!: (result: AgentCompletionResult) => void;
  private completed = false;

  public constructor(private readonly options: TerminalSessionOptions) {
    this.outputBuffer = new OutputBuffer(options.onOutput);
    this.completion = new Promise<AgentCompletionResult>((resolve) => {
      this.resolveCompletion = resolve;
    });

    try {
      this.process = pty.spawn(options.command, options.args, {
        name: "xterm-color",
        cols: DEFAULT_PTY_COLS,
        rows: DEFAULT_PTY_ROWS,
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
        },
      });
    } catch (error) {
      throw new TerminalError(`Failed to spawn PTY for ${options.command}`, error);
    }

    this.process.onData((data) => {
      this.outputBuffer.append(data);
    });

    this.process.onExit(({ exitCode, signal }) => {
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

  public write(input: string): void {
    this.process.write(input);
  }

  public kill(): void {
    if (this.completed) {
      return;
    }

    this.cancelled = true;
    this.process.kill();
  }

  public dispose(): void {
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
    this.resolveCompletion(result);
  }
}
