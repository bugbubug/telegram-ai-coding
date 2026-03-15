import { describe, expect, it, vi } from "vitest";

import { registerMessageHandler } from "../../../src/bot/handlers/message.js";
import { PendingTaskInputStore } from "../../../src/bot/pending-task-input-store.js";

describe("registerMessageHandler", () => {
  it("passes slash commands to later middleware", async () => {
    const on = vi.fn();
    const bot = { on } as unknown as Parameters<typeof registerMessageHandler>[0];
    const handler = vi.fn();
    const pendingTaskInputStore = new PendingTaskInputStore();

    registerMessageHandler(bot, handler, pendingTaskInputStore);

    const middleware = on.mock.calls[0]?.[1] as ((
      ctx: { msg: { text: string }; from?: { id: number } },
      next: () => Promise<void>,
    ) => Promise<void>);
    const next = vi.fn(async () => {});

    await middleware(
      {
        msg: { text: "/claude" },
        from: { id: 1 },
      },
      next,
    );

    expect(handler).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("consumes pending agent input for plain text messages", async () => {
    const on = vi.fn();
    const bot = { on } as unknown as Parameters<typeof registerMessageHandler>[0];
    const handler = vi.fn(async () => {});
    const pendingTaskInputStore = new PendingTaskInputStore();
    pendingTaskInputStore.set(1, "claude-code");

    registerMessageHandler(bot, handler, pendingTaskInputStore);

    const middleware = on.mock.calls[0]?.[1] as ((
      ctx: { msg: { text: string }; from?: { id: number } },
      next: () => Promise<void>,
    ) => Promise<void>);

    await middleware(
      {
        msg: { text: "帮我分析这个项目" },
        from: { id: 1 },
      },
      async () => {},
    );

    expect(handler).toHaveBeenCalledWith(
      {
        msg: { text: "帮我分析这个项目" },
        from: { id: 1 },
      },
      "帮我分析这个项目",
      "claude-code",
    );
    expect(pendingTaskInputStore.get(1)).toBeNull();
  });
});
