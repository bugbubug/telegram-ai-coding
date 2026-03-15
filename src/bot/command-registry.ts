import { ValidationError } from "../core/errors.js";
import type { AgentCommandDefinition, CommandRegistry } from "../core/types.js";

export class InMemoryCommandRegistry implements CommandRegistry {
  private readonly commands = new Map<string, AgentCommandDefinition>();

  public registerAgentCommand(command: AgentCommandDefinition): void {
    if (this.commands.has(command.name)) {
      throw new ValidationError(`Command "/${command.name}" is already registered`);
    }

    this.commands.set(command.name, command);
  }

  public listAgentCommands(): AgentCommandDefinition[] {
    return [...this.commands.values()];
  }
}
