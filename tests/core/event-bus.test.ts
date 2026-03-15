import { describe, expect, it, vi } from "vitest";

import { EventBus } from "../../src/core/event-bus.js";

describe("EventBus", () => {
  it("emits and unsubscribes listeners", () => {
    const bus = new EventBus();
    const listener = vi.fn();

    const unsubscribe = bus.on("task:queued", listener);
    bus.emit("task:queued", {
      task: {
        id: "task-1",
        userId: 1,
        agentName: "codex",
        prompt: "hello",
        status: "queued",
        workspaceSourcePath: "/tmp/source",
        workspacePath: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount("task:queued")).toBe(1);

    unsubscribe();
    expect(bus.listenerCount("task:queued")).toBe(0);
  });

  it("supports once listeners", () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.once("queue:degraded", listener);
    bus.emit("queue:degraded", { reason: "redis down" });
    bus.emit("queue:degraded", { reason: "still down" });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
