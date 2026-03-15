import { describe, expect, it } from "vitest";

import { PendingTaskInputStore } from "../../src/bot/pending-task-input-store.js";

describe("PendingTaskInputStore", () => {
  it("stores and consumes pending agent input", () => {
    const store = new PendingTaskInputStore();
    store.set(1, "claude-code");

    expect(store.get(1)?.agentName).toBe("claude-code");
    expect(store.consume(1)?.agentName).toBe("claude-code");
    expect(store.get(1)).toBeNull();
  });

  it("clears pending agent input", () => {
    const store = new PendingTaskInputStore();
    store.set(1, "codex");
    store.clear(1);

    expect(store.get(1)).toBeNull();
  });
});
