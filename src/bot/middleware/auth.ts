import type { MiddlewareFn } from "grammy";

import type { AppConfig } from "../../config/index.js";

export const createAuthMiddleware = (config: AppConfig): MiddlewareFn =>
  async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !config.TELEGRAM_ALLOWED_USERS.includes(userId)) {
      await ctx.reply("你没有权限使用这个机器人。");
      return;
    }

    await next();
  };
