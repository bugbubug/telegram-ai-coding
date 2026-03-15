import type { MiddlewareFn } from "grammy";

import type { LoggerLike } from "../../core/types.js";
import type { MessageHistoryStore } from "../message-history-store.js";

export const createMessageTrackerMiddleware = (
  messageHistoryStore: MessageHistoryStore,
  logger?: LoggerLike,
): MiddlewareFn => async (ctx, next) => {
  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = (async (...args) => {
    const message = await originalReply(...args);
    const chatId = typeof ctx.chat?.id === "number" ? ctx.chat.id : undefined;
    const messageId = typeof message.message_id === "number" ? message.message_id : undefined;
    if (chatId && messageId) {
      messageHistoryStore.track(chatId, messageId);
      logger?.info(
        {
          chatId,
          messageId,
        },
        "Tracked outgoing Telegram message",
      );
    }
    return message;
  }) as typeof ctx.reply;

  await next();
};
