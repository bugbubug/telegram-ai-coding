import fs from "node:fs/promises";
import path from "node:path";

import { WorkspaceError } from "../../core/errors.js";
import type { Task, Workspace } from "../../core/types.js";
import { checkoutBranch, createBranch, isGitRepo } from "./git-utils.js";

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
    await fs.rm(workspacePath, { recursive: true, force: true });
    await fs.cp(task.workspaceSourcePath, workspacePath, {
      recursive: true,
    });

    let branchName: string | undefined;
    if (this.gitBranchIsolation && (await isGitRepo(workspacePath))) {
      branchName = `task/${task.id}`;
      await createBranch(workspacePath, branchName);
      await checkoutBranch(workspacePath, branchName);
    }

    return {
      taskId: task.id,
      sourcePath: task.workspaceSourcePath,
      path: workspacePath,
      branchName,
    };
  }

  public async cleanup(workspacePath: string): Promise<void> {
    ensureWithinBaseDir(this.baseDir, workspacePath);
    await fs.rm(workspacePath, { recursive: true, force: true });
  }
}
