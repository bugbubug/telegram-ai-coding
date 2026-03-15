import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

import { AgentError } from "../../core/errors.js";
import type { AgentAdapter, AgentSession, AgentSpawnOptions, EventBusLike } from "../../core/types.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";

const execFile = promisify(execFileCallback);

export abstract class BaseAgent implements AgentAdapter {
  public abstract readonly name: string;

  public constructor(
    private readonly terminalManager: TerminalManager,
    private readonly eventBus: EventBusLike,
    private readonly commandPath: string,
    private readonly extraArgs: string[],
  ) {}

  public async isAvailable(): Promise<boolean> {
    if (this.commandPath.includes("/")) {
      return true;
    }

    try {
      await execFile("which", [this.commandPath]);
      return true;
    } catch {
      return false;
    }
  }

  public spawn(options: AgentSpawnOptions): Promise<AgentSession> {
    try {
      const session = this.terminalManager.create({
        command: this.commandPath,
        args: [...this.extraArgs, ...this.buildArgs(options.prompt)],
        cwd: options.cwd,
        env: options.env,
        preferPty: this.prefersPty(),
        closeStdinOnStart: this.shouldCloseStdinOnStart(),
        onOutput: (chunk) => {
          this.eventBus.emit("task:output", { taskId: options.taskId, chunk });
        },
      });

      options.abortSignal?.addEventListener("abort", () => {
        session.kill();
      });

      return Promise.resolve(session);
    } catch (error) {
      throw new AgentError(`Failed to spawn ${this.name}`, error);
    }
  }

  protected abstract buildArgs(prompt: string): string[];

  protected prefersPty(): boolean {
    return true;
  }

  protected shouldCloseStdinOnStart(): boolean {
    return false;
  }
}
