import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceManager } from "../../../src/services/workspace/workspace-manager.js";
import type { Task } from "../../../src/core/types.js";

const execFile = promisify(execFileCallback);

const tempDirs: string[] = [];

const createTask = (workspaceSourcePath: string, id: string): Task => {
  const timestamp = new Date().toISOString();
  return {
    id,
    userId: 1,
    agentName: "codex",
    prompt: "analyze repo",
    status: "queued",
    workspaceSourcePath,
    workspacePath: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("WorkspaceManager", () => {
  it("creates a git worktree for git repositories", async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-source-"));
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-base-"));
    tempDirs.push(sourceDir, baseDir);

    await execFile("git", ["init", "-b", "main"], { cwd: sourceDir });
    await execFile("git", ["config", "user.email", "codex@example.com"], { cwd: sourceDir });
    await execFile("git", ["config", "user.name", "Codex"], { cwd: sourceDir });
    await fs.writeFile(path.join(sourceDir, "README.md"), "hello");
    await execFile("git", ["add", "."], { cwd: sourceDir });
    await execFile("git", ["commit", "-m", "init"], { cwd: sourceDir });

    const manager = new WorkspaceManager(baseDir, true);
    const workspace = await manager.prepareWorkspace(createTask(sourceDir, "task-1"));

    expect(workspace.branchName).toBe("task/task-1");
    expect(workspace.path).toBe(path.join(baseDir, "task-1"));
    await expect(fs.readFile(path.join(workspace.path, "README.md"), "utf8")).resolves.toBe("hello");

    const currentBranch = await execFile("git", ["branch", "--show-current"], {
      cwd: workspace.path,
    });
    expect(currentBranch.stdout.trim()).toBe("task/task-1");

    await manager.cleanup(workspace);
    await expect(fs.access(workspace.path)).rejects.toThrow();
  });

  it("falls back to copying non-git directories", async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-copy-source-"));
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-copy-base-"));
    tempDirs.push(sourceDir, baseDir);

    await fs.writeFile(path.join(sourceDir, "notes.txt"), "copy me");

    const manager = new WorkspaceManager(baseDir, true);
    const workspace = await manager.prepareWorkspace(createTask(sourceDir, "task-2"));

    expect(workspace.branchName).toBeUndefined();
    await expect(fs.readFile(path.join(workspace.path, "notes.txt"), "utf8")).resolves.toBe("copy me");
  });
});
