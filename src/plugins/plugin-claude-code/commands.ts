import type { AgentCommandDefinition } from "../../core/types.js";

export const claudeCodeCommand: AgentCommandDefinition = {
  name: "claude",
  description: "创建 Claude Code 任务",
  agentName: "claude-code",
};
