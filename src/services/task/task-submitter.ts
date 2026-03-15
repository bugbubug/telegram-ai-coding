import fs from "node:fs/promises";

import { NotFoundError, ValidationError } from "../../core/errors.js";
import type { Task } from "../../core/types.js";
import type { TaskStore } from "./task-store.js";
import {
  commitAllChanges,
  getCurrentBranch,
  getHeadCommit,
  hasPendingChanges,
  isGitRepo,
  stageAllChanges,
} from "../workspace/git-utils.js";

export interface TaskSubmitResult {
  task: Task;
  branchName: string;
  commitHash: string;
  committed: boolean;
}

const defaultCommitMessage = (task: Task): string => `chore(task): submit ${task.id}`;

export class TaskSubmitter {
  public constructor(private readonly taskStore: TaskStore) {}

  public async submitTask(
    taskId: string,
    userId: number,
    commitMessage?: string,
  ): Promise<TaskSubmitResult> {
    const task = this.taskStore.getTask(taskId);
    if (task.userId !== userId) {
      throw new NotFoundError(`Task "${taskId}" not found`);
    }

    if (task.status !== "completed") {
      throw new ValidationError(`Task "${taskId}" is not completed yet`);
    }

    if (!task.workspacePath) {
      throw new ValidationError(`Task "${taskId}" does not have a retained worktree`);
    }

    try {
      await fs.access(task.workspacePath);
    } catch (error) {
      throw new ValidationError(`Task "${taskId}" worktree no longer exists`, error);
    }
    if (!(await isGitRepo(task.workspacePath))) {
      throw new ValidationError(`Task "${taskId}" workspace is not a git repository`);
    }

    const branchName = await getCurrentBranch(task.workspacePath);
    if (!branchName) {
      throw new ValidationError(`Task "${taskId}" workspace is not on a branch`);
    }

    const finalCommitMessage = commitMessage?.trim() || defaultCommitMessage(task);
    const committed = await this.commitIfNeeded(task.workspacePath, finalCommitMessage);
    const commitHash = await getHeadCommit(task.workspacePath);

    return {
      task,
      branchName,
      commitHash,
      committed,
    };
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
