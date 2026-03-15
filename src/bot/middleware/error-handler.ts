import type { BotError } from "grammy";

import { AppError } from "../../core/errors.js";
import type { LoggerLike } from "../../core/types.js";

export const createErrorHandler =
  (logger: LoggerLike) =>
  async (error: BotError): Promise<void> => {
    const cause = error.error;
    logger.error({ error: cause }, "Telegram bot error");
    if (cause instanceof AppError && cause.isOperational) {
      await error.ctx.reply(cause.message);
      return;
    }

    await error.ctx.reply("Something went wrong while processing your request.");
  };
