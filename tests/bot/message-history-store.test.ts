import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MessageHistoryStore } from "../../src/bot/message-history-store.js";

const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
  tempPaths.length = 0;
});

describe("MessageHistoryStore", () => {
  it("tracks messages per chat", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "message-history-"));
    tempPaths.push(tempDir);
    const store = new MessageHistoryStore(200, path.join(tempDir, "message-history.json"));
    store.track(1, 100);
    store.track(1, 101);
    store.track(2, 200);

    expect(store.list(1)).toEqual([100, 101]);
    expect(store.list(2)).toEqual([200]);
  });

  it("caps the number of tracked messages and clears by chat", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "message-history-"));
    tempPaths.push(tempDir);
    const store = new MessageHistoryStore(2, path.join(tempDir, "message-history.json"));
    store.track(1, 100);
    store.track(1, 101);
    store.track(1, 102);

    expect(store.list(1)).toEqual([101, 102]);

    store.clear(1);
    expect(store.list(1)).toEqual([]);
  });

  it("persists tracked messages across store instances", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "message-history-"));
    tempPaths.push(tempDir);
    const filePath = path.join(tempDir, "message-history.json");

    const firstStore = new MessageHistoryStore(200, filePath);
    firstStore.track(1, 100);
    firstStore.track(1, 101);

    const secondStore = new MessageHistoryStore(200, filePath);
    expect(secondStore.list(1)).toEqual([100, 101]);
  });
});
