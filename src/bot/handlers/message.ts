import type { Bot } from "grammy";

import type { createTaskMessageHandler } from "../commands/task.js";
import type { PendingTaskInputStore } from "../pending-task-input-store.js";

export const registerMessageHandler = (
  bot: Bot,
  handler: ReturnType<typeof createTaskMessageHandler>,
  pendingTaskInputStore: PendingTaskInputStore,
): void => {
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.msg.text.trim();
    if (text.startsWith("/")) {
      await next();
      return;
    }

    const pendingInput = pendingTaskInputStore.consume(ctx.from?.id ?? 0);
    await handler(ctx, text, pendingInput?.agentName);
  });
};
