import type { MiddlewareFn } from "grammy";

import type { AppConfig } from "../../config/index.js";

export const createAuthMiddleware = (config: AppConfig): MiddlewareFn =>
  async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !config.TELEGRAM_ALLOWED_USERS.includes(userId)) {
      await ctx.reply("You are not authorized to use this bot.");
      return;
    }

    await next();
  };
