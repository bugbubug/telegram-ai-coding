import type { EventBusLike } from "../../core/types.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
import { BaseAgent } from "./base-agent.js";

export class ClaudeCodeAgent extends BaseAgent {
  public readonly name = "claude-code";

  public constructor(
    terminalManager: TerminalManager,
    eventBus: EventBusLike,
    commandPath: string,
    extraArgs: string[],
  ) {
    super(terminalManager, eventBus, commandPath, extraArgs);
  }

  protected buildArgs(prompt: string): string[] {
    return ["--print", prompt];
  }

  protected prefersPty(): boolean {
    // Claude print mode can block on PTY sessions without producing output.
    return false;
  }
}
