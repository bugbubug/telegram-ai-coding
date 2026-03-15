import type { Bot } from "grammy";

import type { CommandRegistry } from "../../core/types.js";
import { replyChunked } from "./task.js";

export const registerStartCommand = (bot: Bot, commandRegistry: CommandRegistry): void => {
  bot.command("start", async (ctx) => {
    const pluginCommands = commandRegistry
      .listAgentCommands()
      .map((command) => `/${command.name} - ${command.description}`)
      .join("\n");
    await replyChunked(
      ctx,
      [
        "Telegram AI Manager",
        "",
        "/task [workspace::]prompt - create a task",
        "/status - list active tasks",
        "/logs [task_id] - show recent logs",
        "/cancel [task_id] - cancel a task",
        pluginCommands,
      ]
        .filter((line) => line.length > 0)
        .join("\n"),
    );
  });
};
