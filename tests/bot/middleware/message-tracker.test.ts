import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageHistoryStore } from "../../../src/bot/message-history-store.js";
import { createMessageTrackerMiddleware } from "../../../src/bot/middleware/message-tracker.js";

const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
  tempPaths.length = 0;
});

describe("createMessageTrackerMiddleware", () => {
  it("tracks messages returned from ctx.reply", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "message-tracker-"));
    tempPaths.push(tempDir);
    const store = new MessageHistoryStore(200, path.join(tempDir, "message-history.json"));
    const middleware = createMessageTrackerMiddleware(store);
    const next = vi.fn();
    const ctx: {
      chat: { id: number };
      reply: (text: string) => Promise<{ message_id: number }>;
    } = {
      chat: { id: 1 },
      reply: vi.fn(() => Promise.resolve({ message_id: 101 })),
    };

    await middleware(ctx as never, async () => {
      await ctx.reply("hello");
      next();
    });

    expect(store.list(1)).toEqual([101]);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
