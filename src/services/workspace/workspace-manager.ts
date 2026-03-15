import fs from "node:fs/promises";
import path from "node:path";

import { WorkspaceError } from "../../core/errors.js";
import type { Task, Workspace } from "../../core/types.js";
import {
  addWorktree,
  branchExists,
  deleteBranch,
  isGitRepo,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
} from "./git-utils.js";

const ensureWithinBaseDir = (baseDir: string, targetPath: string): void => {
  const relative = path.relative(baseDir, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WorkspaceError(`Refusing to operate outside workspace base dir: ${targetPath}`);
  }
};

export class WorkspaceManager {
  public constructor(
    private readonly baseDir: string,
    private readonly gitBranchIsolation: boolean,
  ) {}

  public async prepareWorkspace(task: Task): Promise<Workspace> {
    const workspacePath = path.join(this.baseDir, task.id);
    await fs.mkdir(this.baseDir, { recursive: true });

    let branchName: string | undefined = undefined;
    if (await isGitRepo(task.workspaceSourcePath)) {
      branchName = `task/${task.id}`;
      await this.cleanupExistingGitWorkspace(task.workspaceSourcePath, workspacePath, branchName);
      await addWorktree(task.workspaceSourcePath, workspacePath, branchName);
    } else {
      await fs.rm(workspacePath, { recursive: true, force: true });
      await fs.cp(task.workspaceSourcePath, workspacePath, {
        recursive: true,
      });
    }

    return {
      taskId: task.id,
      sourcePath: task.workspaceSourcePath,
      path: workspacePath,
      branchName,
    };
  }

  public async cleanup(workspace: Workspace | string): Promise<void> {
    const workspacePath = typeof workspace === "string" ? workspace : workspace.path;
    ensureWithinBaseDir(this.baseDir, workspacePath);
    if (typeof workspace !== "string" && workspace.branchName && (await isGitRepo(workspace.sourcePath))) {
      await removeWorktree(workspace.sourcePath, workspacePath);
      if (this.gitBranchIsolation) {
        await deleteBranch(workspace.sourcePath, workspace.branchName);
      }
      return;
    }

    await fs.rm(workspacePath, { recursive: true, force: true });
  }

  private async cleanupExistingGitWorkspace(
    repoPath: string,
    workspacePath: string,
    branchName: string,
  ): Promise<void> {
    await pruneWorktrees(repoPath);

    const normalizedWorkspacePath = path.resolve(workspacePath);
    const existingWorktrees = await listWorktrees(repoPath);
    const pathsToRemove = new Set<string>();

    for (const worktree of existingWorktrees) {
      if (worktree.path === normalizedWorkspacePath || worktree.branchName === branchName) {
        pathsToRemove.add(worktree.path);
      }
    }

    for (const worktreePath of pathsToRemove) {
      await removeWorktree(repoPath, worktreePath);
    }

    await fs.rm(normalizedWorkspacePath, { recursive: true, force: true });

    if (await branchExists(repoPath, branchName)) {
      await deleteBranch(repoPath, branchName);
    }
  }
}
