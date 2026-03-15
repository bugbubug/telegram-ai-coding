import type { AgentCommandDefinition } from "../../core/types.js";

export const claudeCodeCommand: AgentCommandDefinition = {
  name: "claude",
  description: "Create a Claude Code task",
  agentName: "claude-code",
};
