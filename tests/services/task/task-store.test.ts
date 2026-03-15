import { describe, expect, it } from "vitest";

import { TaskStore } from "../../../src/services/task/task-store.js";

describe("TaskStore", () => {
  it("creates, updates, queries, and logs tasks", () => {
    const store = new TaskStore(":memory:");
    const task = store.createTask({
      userId: 42,
      agentName: "codex",
      prompt: "echo hello",
      workspaceSourcePath: "/tmp/source",
    });

    expect(store.getTask(task.id).status).toBe("queued");

    store.updateWorkspacePath(task.id, "/tmp/workspace");
    store.updateTaskStatus(task.id, "running");
    store.appendLog(task.id, "line 1");
    store.appendLog(task.id, "line 2");
    store.updateTaskStatus(task.id, "completed");

    expect(store.listTasksByUser(42)).toHaveLength(1);
    expect(store.listTasksByStatuses(["completed"])).toHaveLength(1);
    expect(store.getLatestTaskForUser(42)?.workspacePath).toBe("/tmp/workspace");
    expect(store.getLogs(task.id).map((entry) => entry.content)).toEqual(["line 1", "line 2"]);

    store.close();
  });
});
