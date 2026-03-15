import { NotFoundError, ValidationError } from "../../core/errors.js";
import type { AgentAdapter } from "../../core/types.js";

export class AgentRegistry {
  private readonly agents = new Map<string, AgentAdapter>();
  private defaultAgentName: string | undefined;

  public register(agent: AgentAdapter, isDefault = false): void {
    if (this.agents.has(agent.name)) {
      throw new ValidationError(`Agent "${agent.name}" is already registered`);
    }

    this.agents.set(agent.name, agent);
    if (isDefault || !this.defaultAgentName) {
      this.defaultAgentName = agent.name;
    }
  }

  public get(name: string): AgentAdapter {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new NotFoundError(`Agent "${name}" is not registered`);
    }

    return agent;
  }

  public list(): AgentAdapter[] {
    return [...this.agents.values()];
  }

  public getDefault(): AgentAdapter {
    if (!this.defaultAgentName) {
      throw new NotFoundError("Default agent is not configured");
    }

    return this.get(this.defaultAgentName);
  }
}
