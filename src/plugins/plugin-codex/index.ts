import type { Plugin } from "../../core/types.js";
import { codexCommand } from "./commands.js";

const plugin: Plugin = {
  name: "plugin-codex",
  init(context) {
    context.commandRegistry.registerAgentCommand(codexCommand);
  },
};

export default plugin;
