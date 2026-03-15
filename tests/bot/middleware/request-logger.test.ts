import { describe, expect, it, vi } from "vitest";

import type { LoggerLike } from "../../../src/core/types.js";
import { createRequestLoggerMiddleware } from "../../../src/bot/middleware/request-logger.js";

const createLogger = (): { logger: LoggerLike; info: ReturnType<typeof vi.fn> } => {
  const info = vi.fn();

  return {
    logger: {
      debug: vi.fn(),
      info,
      warn: vi.fn(),
      error: vi.fn(),
    },
    info,
  };
};

describe("createRequestLoggerMiddleware", () => {
  it("logs incoming text messages", async () => {
    const { logger, info } = createLogger();
    const middleware = createRequestLoggerMiddleware(logger);
    const next = vi.fn(() => Promise.resolve());

    await middleware(
      {
        chat: { id: 1 },
        from: { id: 2 },
        msg: { text: "/start" },
      } as Parameters<typeof middleware>[0],
      next,
    );

    expect(info).toHaveBeenCalledWith(
      {
        chatId: 1,
        userId: 2,
        text: "/start",
      },
      "Received Telegram text message",
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("logs callback queries", async () => {
    const { logger, info } = createLogger();
    const middleware = createRequestLoggerMiddleware(logger);
    const next = vi.fn(() => Promise.resolve());

    await middleware(
      {
        chat: { id: 3 },
        from: { id: 4 },
        callbackQuery: { data: "repo:0" },
      } as Parameters<typeof middleware>[0],
      next,
    );

    expect(info).toHaveBeenCalledWith(
      {
        chatId: 3,
        userId: 4,
        data: "repo:0",
      },
      "Received Telegram callback query",
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
