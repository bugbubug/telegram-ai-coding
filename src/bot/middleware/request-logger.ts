import type { MiddlewareFn } from "grammy";

import type { LoggerLike } from "../../core/types.js";

export const createRequestLoggerMiddleware =
  (logger: LoggerLike): MiddlewareFn =>
  async (ctx, next) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (ctx.msg?.text) {
      logger.info(
        {
          chatId,
          userId,
          text: ctx.msg.text,
        },
        "Received Telegram text message",
      );
    } else if (ctx.callbackQuery?.data) {
      logger.info(
        {
          chatId,
          userId,
          data: ctx.callbackQuery.data,
        },
        "Received Telegram callback query",
      );
    }

    await next();
  };
