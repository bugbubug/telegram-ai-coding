import { AgentError, TaskError } from "../../core/errors.js";
import type { AgentSession, EventBusLike, LoggerLike, Task } from "../../core/types.js";
import { TASK_RESTART_FAILURE_REASON } from "../../shared/constants.js";
import type { AgentRegistry } from "../agent/agent-registry.js";
import type { ITaskQueue } from "./task-queue.js";
import type { TaskStore } from "./task-store.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";

export class TaskRunner {
  private readonly controllers = new Map<string, AbortController>();
  private readonly sessions = new Map<string, AgentSession>();
  private started = false;

  public constructor(
    private readonly taskStore: TaskStore,
    private readonly taskQueue: ITaskQueue,
    private readonly workspaceManager: WorkspaceManager,
    private readonly agentRegistry: AgentRegistry,
    private readonly eventBus: EventBusLike,
    private readonly logger: LoggerLike,
  ) {
    this.eventBus.on("task:output", ({ taskId, chunk }) => {
      this.taskStore.appendLog(taskId, chunk);
    });
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    await this.recoverTasks();
    await this.taskQueue.start(async (taskId) => {
      await this.processTask(taskId);
    });
  }

  public async cancelTask(taskId: string): Promise<Task> {
    const runningController = this.controllers.get(taskId);
    if (runningController) {
      runningController.abort();
      const cancelledTask = this.taskStore.updateTaskStatus(taskId, "cancelled");
      this.eventBus.emit("task:cancelled", { task: cancelledTask });
      return cancelledTask;
    }

    const removed = await this.taskQueue.remove(taskId);
    const task = this.taskStore.updateTaskStatus(taskId, "cancelled");
    if (removed) {
      this.eventBus.emit("task:cancelled", { task });
    }

    return task;
  }

  public async shutdown(): Promise<void> {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    for (const session of this.sessions.values()) {
      session.kill();
      session.dispose();
    }
    this.controllers.clear();
    this.sessions.clear();
    await this.taskQueue.close();
  }

  private async recoverTasks(): Promise<void> {
    for (const task of this.taskStore.listTasksByStatuses(["queued"])) {
      await this.taskQueue.enqueue(task.id);
    }

    for (const task of this.taskStore.listTasksByStatuses(["running"])) {
      const failedTask = this.taskStore.updateTaskStatus(
        task.id,
        "failed",
        TASK_RESTART_FAILURE_REASON,
      );
      this.eventBus.emit("task:failed", {
        task: failedTask,
        error: TASK_RESTART_FAILURE_REASON,
      });
    }
  }

  private async processTask(taskId: string): Promise<void> {
    const task = this.taskStore.getTask(taskId);
    if (task.status === "cancelled") {
      return;
    }

    const controller = new AbortController();
    this.controllers.set(task.id, controller);
    try {
      const workspace = await this.workspaceManager.prepareWorkspace(task);
      this.taskStore.updateWorkspacePath(task.id, workspace.path);
      const runningTask = this.taskStore.updateTaskStatus(task.id, "running");
      this.eventBus.emit("task:started", { task: runningTask });

      const agent = this.agentRegistry.get(task.agentName);
      if (!(await agent.isAvailable())) {
        throw new AgentError(`Agent "${task.agentName}" is not available`);
      }

      const session = await agent.spawn({
        taskId: task.id,
        prompt: task.prompt,
        cwd: workspace.path,
        abortSignal: controller.signal,
      });
      this.sessions.set(task.id, session);

      const result = await session.completion;
      if (result.cancelled) {
        const cancelledTask = this.taskStore.updateTaskStatus(task.id, "cancelled");
        this.eventBus.emit("task:cancelled", { task: cancelledTask });
        return;
      }

      if (result.exitCode === 0) {
        const completedTask = this.taskStore.updateTaskStatus(task.id, "completed");
        this.eventBus.emit("task:completed", { task: completedTask });
        return;
      }

      throw new TaskError(
        `Task "${task.id}" failed with exit code ${result.exitCode ?? "unknown"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedTask = this.taskStore.updateTaskStatus(task.id, "failed", message);
      this.eventBus.emit("task:failed", { task: failedTask, error: message });
      this.logger.error({ taskId: task.id, error }, "Task execution failed");
    } finally {
      this.controllers.delete(task.id);
      const session = this.sessions.get(task.id);
      session?.dispose();
      this.sessions.delete(task.id);
    }
  }
}
