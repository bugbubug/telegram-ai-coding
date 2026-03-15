import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { EventBus } from "../../../src/core/event-bus.js";
import type {
  AgentAdapter,
  AgentSession,
  AgentSpawnOptions,
  LoggerLike,
} from "../../../src/core/types.js";
import { AgentRegistry } from "../../../src/services/agent/agent-registry.js";
import { TaskRunner } from "../../../src/services/task/task-runner.js";
import type { ITaskQueue } from "../../../src/services/task/task-queue.js";
import { TaskStore } from "../../../src/services/task/task-store.js";
import { WorkspaceManager } from "../../../src/services/workspace/workspace-manager.js";

class FakeQueue implements ITaskQueue {
  public readonly mode = "memory" as const;
  private processor: ((taskId: string) => Promise<void>) | undefined;
  private readonly queue: string[] = [];

  public async enqueue(taskId: string): Promise<void> {
    this.queue.push(taskId);
    if (this.processor) {
      while (this.queue.length > 0) {
        const nextTaskId = this.queue.shift();
        if (nextTaskId) {
          await this.processor(nextTaskId);
        }
      }
    }
  }

  public remove(taskId: string): Promise<boolean> {
    const index = this.queue.indexOf(taskId);
    if (index === -1) {
      return Promise.resolve(false);
    }
    this.queue.splice(index, 1);
    return Promise.resolve(true);
  }

  public async start(processor: (taskId: string) => Promise<void>): Promise<void> {
    this.processor = processor;
    while (this.queue.length > 0) {
      const nextTaskId = this.queue.shift();
      if (nextTaskId) {
        await processor(nextTaskId);
      }
    }
  }

  public close(): Promise<void> {
    this.queue.length = 0;
    return Promise.resolve();
  }
}

class FakeAgent implements AgentAdapter {
  public readonly name = "codex";

  public constructor(private readonly eventBus: EventBus) {}

  public isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public spawn(options: AgentSpawnOptions): Promise<AgentSession> {
    this.eventBus.emit("task:output", { taskId: options.taskId, chunk: "hello from agent" });
    return Promise.resolve({
      id: "session-1",
      status: "completed",
      completion: Promise.resolve({
        exitCode: 0,
        signal: null,
        cancelled: false,
      }),
      write: vi.fn(),
      kill: vi.fn(),
      dispose: vi.fn(),
    });
  }
}

const logger: LoggerLike = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("TaskRunner", () => {
  it("processes queued tasks end-to-end and persists logs", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-runner-"));
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-source-"));
    tempDirs.push(baseDir, sourceDir);
    await fs.writeFile(path.join(sourceDir, "README.md"), "source");

    const store = new TaskStore(":memory:");
    const queue = new FakeQueue();
    const eventBus = new EventBus();
    const workspaceManager = new WorkspaceManager(baseDir, false);
    const agentRegistry = new AgentRegistry();
    agentRegistry.register(new FakeAgent(eventBus), true);

    const runner = new TaskRunner(store, queue, workspaceManager, agentRegistry, eventBus, logger);
    await runner.start();

    const task = store.createTask({
      userId: 1,
      agentName: "codex",
      prompt: "do work",
      workspaceSourcePath: sourceDir,
    });

    await queue.enqueue(task.id);

    const completedTask = store.getTask(task.id);
    expect(completedTask.status).toBe("completed");
    expect(completedTask.workspacePath).toContain(task.id);
    expect(store.getLogs(task.id).map((entry) => entry.content)).toEqual(["hello from agent"]);

    store.close();
  });

  it("fails running tasks during restart recovery", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-recovery-"));
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-recovery-source-"));
    tempDirs.push(baseDir, sourceDir);

    const store = new TaskStore(":memory:");
    const queue = new FakeQueue();
    const eventBus = new EventBus();
    const workspaceManager = new WorkspaceManager(baseDir, false);
    const agentRegistry = new AgentRegistry();
    agentRegistry.register(new FakeAgent(eventBus), true);

    const queuedTask = store.createTask({
      userId: 1,
      agentName: "codex",
      prompt: "queued",
      workspaceSourcePath: sourceDir,
    });
    const runningTask = store.createTask({
      userId: 1,
      agentName: "codex",
      prompt: "running",
      workspaceSourcePath: sourceDir,
    });
    store.updateTaskStatus(runningTask.id, "running");

    const runner = new TaskRunner(store, queue, workspaceManager, agentRegistry, eventBus, logger);
    await runner.start();

    expect(store.getTask(queuedTask.id).status).toBe("completed");
    expect(store.getTask(runningTask.id).status).toBe("failed");

    store.close();
  });
});
