import type { Plugin } from "../../core/types.js";
import { claudeCodeCommand } from "./commands.js";

const plugin: Plugin = {
  name: "plugin-claude-code",
  init(context) {
    context.commandRegistry.registerAgentCommand(claudeCodeCommand);
  },
};

export default plugin;
