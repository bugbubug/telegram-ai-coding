import type { Bot } from "grammy";

import type { createTaskMessageHandler } from "../commands/task.js";

export const registerMessageHandler = (
  bot: Bot,
  handler: ReturnType<typeof createTaskMessageHandler>,
): void => {
  bot.on("message:text", async (ctx) => {
    const text = ctx.msg.text.trim();
    if (text.startsWith("/")) {
      return;
    }

    await handler(ctx, text);
  });
};
