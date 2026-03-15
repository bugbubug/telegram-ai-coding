import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceError } from "../../../src/core/errors.js";
import { TaskPublisher } from "../../../src/services/task/task-publisher.js";
import { TaskStore } from "../../../src/services/task/task-store.js";
import { WorkspaceManager } from "../../../src/services/workspace/workspace-manager.js";

const execFile = promisify(execFileCallback);

const tempDirs: string[] = [];

const configureGitIdentity = async (cwd: string): Promise<void> => {
  await execFile("git", ["config", "user.email", "codex@example.com"], { cwd });
  await execFile("git", ["config", "user.name", "Codex"], { cwd });
};

const createSourceRepo = async (): Promise<{ sourceDir: string; remoteDir: string; baseDir: string }> => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-publisher-source-"));
  const remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-publisher-remote-"));
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-publisher-worktrees-"));
  tempDirs.push(sourceDir, remoteDir, baseDir);

  await execFile("git", ["init", "-b", "main"], { cwd: sourceDir });
  await configureGitIdentity(sourceDir);
  await fs.writeFile(path.join(sourceDir, "README.md"), "hello\n");
  await execFile("git", ["add", "."], { cwd: sourceDir });
  await execFile("git", ["commit", "-m", "init"], { cwd: sourceDir });

  await execFile("git", ["init", "--bare"], { cwd: remoteDir });
  await execFile("git", ["remote", "add", "origin", remoteDir], { cwd: sourceDir });
  await execFile("git", ["push", "-u", "origin", "main"], { cwd: sourceDir });

  return { sourceDir, remoteDir, baseDir };
};

const createCompletedGitTask = async (): Promise<{
  baseDir: string;
  remoteDir: string;
  sourceDir: string;
  store: TaskStore;
  manager: WorkspaceManager;
}> => {
  const { sourceDir, remoteDir, baseDir } = await createSourceRepo();
  const store = new TaskStore(":memory:");
  const manager = new WorkspaceManager(baseDir, true);
  const task = store.createTask({
    userId: 42,
    agentName: "codex",
    prompt: "apply change",
    workspaceSourcePath: sourceDir,
  });

  const workspace = await manager.prepareWorkspace(task);
  store.updateWorkspacePath(task.id, workspace.path);
  store.updateTaskStatus(task.id, "completed");

  return {
    baseDir,
    remoteDir,
    sourceDir,
    store,
    manager,
  };
};

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("TaskPublisher", () => {
  it("commits completed task changes on the retained branch", async () => {
    const { sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    const result = await publisher.submitTask(task.id, 42);
    const log = await execFile("git", ["log", "-1", "--pretty=%s"], { cwd: task.workspacePath! });

    expect(result.committed).toBe(true);
    expect(result.branchName).toBe(`task/${task.id}`);
    expect(result.commitHash).toMatch(/^[a-f0-9]{40}$/u);
    expect(log.stdout.trim()).toBe(`chore(task): submit ${task.id}`);

    store.close();
    await execFile("git", ["status", "--short"], { cwd: sourceDir });
  });

  it("merges the submitted task branch into local main with fast-forward only", async () => {
    const { sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    const submitResult = await publisher.submitTask(task.id, 42);
    const result = await publisher.mergeTask(task.id, 42);
    const branchHead = await execFile("git", ["rev-parse", submitResult.branchName], { cwd: sourceDir });
    const mainHead = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });

    expect(result.merged).toBe(true);
    expect(mainHead.stdout.trim()).toBe(branchHead.stdout.trim());

    store.close();
  });

  it("blocks merge when local main has uncommitted changes", async () => {
    const { sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);
    await fs.writeFile(path.join(sourceDir, "LOCAL.txt"), "dirty\n");
    const headBefore = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });

    await expect(publisher.mergeTask(task.id, 42)).rejects.toThrow(
      "Repository has uncommitted changes on local main",
    );

    const headAfter = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });
    expect(headAfter.stdout.trim()).toBe(headBefore.stdout.trim());

    store.close();
  });

  it("blocks merge when the source repository is not on main", async () => {
    const { sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);
    await execFile("git", ["checkout", "-b", "feature/local"], { cwd: sourceDir });

    await expect(publisher.mergeTask(task.id, 42)).rejects.toThrow(
      'Repository is on "feature/local", not "main"',
    );

    store.close();
  });

  it("blocks merge when the task branch cannot be fast-forward merged", async () => {
    const { sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);

    await fs.writeFile(path.join(sourceDir, "MAIN.txt"), "main change\n");
    await execFile("git", ["add", "."], { cwd: sourceDir });
    await execFile("git", ["commit", "-m", "main diverged"], { cwd: sourceDir });
    const headBefore = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });

    await expect(publisher.mergeTask(task.id, 42)).rejects.toThrow(
      `Task "${task.id}" cannot be fast-forward merged into local main`,
    );

    const headAfter = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });
    expect(headAfter.stdout.trim()).toBe(headBefore.stdout.trim());

    store.close();
  });

  it("pushes local main and removes the retained worktree after success", async () => {
    const { remoteDir, sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);
    await publisher.mergeTask(task.id, 42);
    const result = await publisher.pushTask(task.id, 42);

    const remoteHead = await execFile("git", ["rev-parse", "refs/heads/main"], { cwd: remoteDir });
    const localHead = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });

    expect(result.commitHash).toBe(localHead.stdout.trim());
    expect(result.cleanup.status).toBe("removed");
    expect(result.task.workspacePath).toBeNull();
    expect(remoteHead.stdout.trim()).toBe(localHead.stdout.trim());
    await expect(fs.access(task.workspacePath!)).rejects.toThrow();

    const branch = await execFile("git", ["rev-parse", "--verify", `task/${task.id}`], { cwd: sourceDir });
    expect(branch.stdout.trim()).toMatch(/^[a-f0-9]{40}$/u);

    store.close();
  });

  it("allows push to succeed when the retained worktree is already missing", async () => {
    const { sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);
    await publisher.mergeTask(task.id, 42);
    await manager.cleanupRetainedWorkspace({
      taskId: task.id,
      sourcePath: sourceDir,
      path: task.workspacePath!,
      branchName: `task/${task.id}`,
    });

    const result = await publisher.pushTask(task.id, 42);

    expect(result.cleanup.status).toBe("missing");
    expect(result.cleanup.message).toBe("worktree 已不存在，无需清理");
    expect(result.task.workspacePath).toBeNull();

    store.close();
  });

  it("returns partial success when push succeeds but worktree cleanup fails", async () => {
    const { sourceDir, store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);
    await publisher.mergeTask(task.id, 42);

    const failingPublisher = new TaskPublisher(store, {
      cleanupRetainedWorkspace: () => Promise.reject(new WorkspaceError("无法删除保留的 worktree")),
    } as never);
    const headBefore = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });
    const result = await failingPublisher.pushTask(task.id, 42);
    const headAfter = await execFile("git", ["rev-parse", "main"], { cwd: sourceDir });

    expect(result.cleanup.status).toBe("failed");
    expect(result.cleanup.message).toBe("无法删除保留的 worktree");
    expect(result.task.workspacePath).toBe(task.workspacePath);
    expect(headAfter.stdout.trim()).toBe(headBefore.stdout.trim());

    store.close();
  });

  it("does not clean the worktree when push is rejected", async () => {
    const { store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);

    await expect(publisher.pushTask(task.id, 42)).rejects.toThrow(
      `Task "${task.id}" has not been merged into local main yet`,
    );
    await expect(fs.access(task.workspacePath!)).resolves.toBeUndefined();

    store.close();
  });

  it("blocks push when the retained worktree has uncommitted changes", async () => {
    const { store, manager } = await createCompletedGitTask();
    const task = store.listTasksByUser(42, ["completed"])[0];
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "updated\n");

    const publisher = new TaskPublisher(store, manager);
    await publisher.submitTask(task.id, 42);
    await publisher.mergeTask(task.id, 42);
    await fs.writeFile(path.join(task.workspacePath!, "README.md"), "dirty after merge\n");

    await expect(publisher.pushTask(task.id, 42)).rejects.toThrow(
      `Task "${task.id}" worktree has uncommitted changes`,
    );
    await expect(fs.access(task.workspacePath!)).resolves.toBeUndefined();

    store.close();
  });
});
