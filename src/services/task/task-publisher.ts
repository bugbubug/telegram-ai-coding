import fs from "node:fs/promises";

import { NotFoundError, ValidationError, WorkspaceError } from "../../core/errors.js";
import type { Task } from "../../core/types.js";
import type { WorkspaceManager, WorkspaceCleanupResult } from "../workspace/workspace-manager.js";
import type { TaskStore } from "./task-store.js";
import {
  branchExists,
  getCurrentBranch,
  getHeadCommit,
  getHeadCommitForRef,
  getRepositoryRoot,
  hasPendingChanges,
  hasRemote,
  isAncestorCommit,
  isGitRepo,
  mergeBranchFastForward,
  pushBranch,
  stageAllChanges,
  commitAllChanges,
} from "../workspace/git-utils.js";

export interface TaskSubmitResult {
  task: Task;
  branchName: string;
  commitHash: string;
  committed: boolean;
}

export interface TaskMergerResult {
  task: Task;
  branchName: string;
  commitHash: string;
  merged: boolean;
}

export interface TaskPushResult {
  task: Task;
  branchName: string;
  commitHash: string;
  cleanup: WorkspaceCleanupResult;
}

const defaultCommitMessage = (task: Task): string => `chore(task): submit ${task.id}`;
const taskBranchName = (task: Task): string => `task/${task.id}`;

export class TaskPublisher {
  public constructor(
    private readonly taskStore: TaskStore,
    private readonly workspaceManager: WorkspaceManager,
  ) {}

  public async findLatestTaskIdForAction(
    userId: number,
    action: "submit" | "merge" | "push",
  ): Promise<string | null> {
    const tasks = this.taskStore.listTasksByUser(userId, ["completed"]);
    for (const task of tasks) {
      try {
        if (action === "submit") {
          await this.getTaskWorkspace(task);
        } else if (action === "merge") {
          await this.assertMergeable(task);
        } else {
          await this.assertPushable(task);
        }
        return task.id;
      } catch {
        continue;
      }
    }

    return null;
  }

  public async submitTask(
    taskId: string,
    userId: number,
    commitMessage?: string,
  ): Promise<TaskSubmitResult> {
    const task = this.getOwnedCompletedTask(taskId, userId);
    const workspacePath = await this.getTaskWorkspace(task);
    const branchName = await getCurrentBranch(workspacePath);
    if (!branchName) {
      throw new ValidationError(`Task "${taskId}" workspace is not on a branch`);
    }

    const finalCommitMessage = commitMessage?.trim() || defaultCommitMessage(task);
    const committed = await this.commitIfNeeded(workspacePath, finalCommitMessage);
    const commitHash = await getHeadCommit(workspacePath);

    return {
      task,
      branchName,
      commitHash,
      committed,
    };
  }

  public async mergeTask(taskId: string, userId: number): Promise<TaskMergerResult> {
    const task = this.getOwnedCompletedTask(taskId, userId);
    const { repoPath, branchName } = await this.assertMergeable(task);
    const branchCommit = await getHeadCommitForRef(repoPath, branchName);

    if (await isAncestorCommit(repoPath, branchCommit, "main")) {
      return {
        task,
        branchName,
        commitHash: await getHeadCommit(repoPath),
        merged: false,
      };
    }

    try {
      await mergeBranchFastForward(repoPath, branchName);
    } catch (error) {
      throw new ValidationError(
        `Task "${taskId}" cannot be fast-forward merged into local main`,
        error,
      );
    }

    return {
      task,
      branchName,
      commitHash: await getHeadCommit(repoPath),
      merged: true,
    };
  }

  public async pushTask(taskId: string, userId: number): Promise<TaskPushResult> {
    const task = this.getOwnedCompletedTask(taskId, userId);
    const { repoPath, branchName } = await this.assertPushable(task);

    try {
      await pushBranch(repoPath, "origin", "main");
    } catch (error) {
      throw new ValidationError(`Failed to push local main to origin/main`, error);
    }

    const cleanup = await this.cleanupTaskWorktree(task, repoPath, branchName);
    const updatedTask =
      cleanup.status === "failed" ? task : this.taskStore.updateWorkspacePath(task.id, null);

    return {
      task: updatedTask,
      branchName,
      commitHash: await getHeadCommit(repoPath),
      cleanup,
    };
  }

  private getOwnedCompletedTask(taskId: string, userId: number): Task {
    const task = this.taskStore.getTask(taskId);
    if (task.userId !== userId) {
      throw new NotFoundError(`Task "${taskId}" not found`);
    }

    if (task.status !== "completed") {
      throw new ValidationError(`Task "${taskId}" is not completed yet`);
    }

    return task;
  }

  private async getTaskWorkspace(task: Task): Promise<string> {
    if (!task.workspacePath) {
      throw new ValidationError(`Task "${task.id}" does not have a retained worktree`);
    }

    try {
      await fs.access(task.workspacePath);
    } catch (error) {
      throw new ValidationError(`Task "${task.id}" worktree no longer exists`, error);
    }

    if (!(await isGitRepo(task.workspacePath))) {
      throw new ValidationError(`Task "${task.id}" workspace is not a git repository`);
    }

    return task.workspacePath;
  }

  private async getGitTaskContext(task: Task): Promise<{ repoPath: string; branchName: string }> {
    if (!(await isGitRepo(task.workspaceSourcePath))) {
      throw new ValidationError(`Task "${task.id}" source path is not a git repository`);
    }

    return {
      repoPath: await getRepositoryRoot(task.workspaceSourcePath),
      branchName: taskBranchName(task),
    };
  }

  private async assertRepositoryReadyForMain(repoPath: string): Promise<void> {
    const currentBranch = await getCurrentBranch(repoPath);
    if (currentBranch !== "main") {
      throw new ValidationError(`Repository is on "${currentBranch || "detached"}", not "main"`);
    }

    if (await hasPendingChanges(repoPath)) {
      throw new ValidationError("Repository has uncommitted changes on local main");
    }
  }

  private async assertMergeable(task: Task): Promise<{ repoPath: string; branchName: string }> {
    const { repoPath, branchName } = await this.getGitTaskContext(task);
    await this.assertRepositoryReadyForMain(repoPath);
    await this.assertWorktreeCleanIfPresent(task);

    if (!(await branchExists(repoPath, branchName))) {
      throw new ValidationError(`Task branch "${branchName}" does not exist`);
    }

    return { repoPath, branchName };
  }

  private async assertPushable(task: Task): Promise<{ repoPath: string; branchName: string }> {
    const { repoPath, branchName } = await this.getGitTaskContext(task);
    await this.assertRepositoryReadyForMain(repoPath);
    await this.assertWorktreeCleanIfPresent(task);

    if (!(await branchExists(repoPath, branchName))) {
      throw new ValidationError(`Task branch "${branchName}" does not exist`);
    }

    if (!(await hasRemote(repoPath, "origin"))) {
      throw new ValidationError('Repository remote "origin" does not exist');
    }

    const branchCommit = await getHeadCommitForRef(repoPath, branchName);
    if (!(await isAncestorCommit(repoPath, branchCommit, "main"))) {
      throw new ValidationError(`Task "${task.id}" has not been merged into local main yet`);
    }

    return { repoPath, branchName };
  }

  private async assertWorktreeCleanIfPresent(task: Task): Promise<void> {
    if (!task.workspacePath) {
      return;
    }

    try {
      await fs.access(task.workspacePath);
    } catch {
      return;
    }

    if (!(await isGitRepo(task.workspacePath))) {
      throw new ValidationError(`Task "${task.id}" workspace is not a git repository`);
    }

    if (await hasPendingChanges(task.workspacePath)) {
      throw new ValidationError(`Task "${task.id}" worktree has uncommitted changes`);
    }
  }

  private async cleanupTaskWorktree(
    task: Task,
    repoPath: string,
    branchName: string,
  ): Promise<WorkspaceCleanupResult> {
    if (!task.workspacePath) {
      return {
        status: "missing",
        message: "worktree 已不存在，无需清理",
      };
    }

    try {
      return await this.workspaceManager.cleanupRetainedWorkspace({
        taskId: task.id,
        sourcePath: repoPath,
        path: task.workspacePath,
        branchName,
      });
    } catch (error) {
      if (error instanceof WorkspaceError) {
        return {
          status: "failed",
          message: error.message,
        };
      }

      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async commitIfNeeded(workspacePath: string, commitMessage: string): Promise<boolean> {
    if (!(await hasPendingChanges(workspacePath))) {
      return false;
    }

    await stageAllChanges(workspacePath);
    await commitAllChanges(workspacePath, commitMessage);
    return true;
  }
}
