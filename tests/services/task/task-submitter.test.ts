import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { TaskStore } from "../../../src/services/task/task-store.js";
import { TaskSubmitter } from "../../../src/services/task/task-submitter.js";

const execFile = promisify(execFileCallback);

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("TaskSubmitter", () => {
  it("commits completed task changes on the retained branch", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-submit-workspace-"));
    tempDirs.push(workspaceDir);

    await execFile("git", ["init", "-b", "main"], { cwd: workspaceDir });
    await execFile("git", ["config", "user.email", "codex@example.com"], { cwd: workspaceDir });
    await execFile("git", ["config", "user.name", "Codex"], { cwd: workspaceDir });
    await fs.writeFile(path.join(workspaceDir, "README.md"), "hello");
    await execFile("git", ["add", "."], { cwd: workspaceDir });
    await execFile("git", ["commit", "-m", "init"], { cwd: workspaceDir });
    await execFile("git", ["checkout", "-b", "task/task-1"], { cwd: workspaceDir });
    await fs.writeFile(path.join(workspaceDir, "README.md"), "updated");

    const store = new TaskStore(":memory:");
    const task = store.createTask({
      userId: 42,
      agentName: "codex",
      prompt: "apply change",
      workspaceSourcePath: workspaceDir,
    });
    store.updateWorkspacePath(task.id, workspaceDir);
    store.updateTaskStatus(task.id, "completed");

    const submitter = new TaskSubmitter(store);
    const result = await submitter.submitTask(task.id, 42);
    const log = await execFile("git", ["log", "-1", "--pretty=%s"], { cwd: workspaceDir });

    expect(result.committed).toBe(true);
    expect(result.branchName).toBe("task/task-1");
    expect(result.commitHash).toMatch(/^[a-f0-9]{40}$/u);
    expect(log.stdout.trim()).toBe(`chore(task): submit ${task.id}`);

    store.close();
  });

  it("returns the current commit when the workspace is already clean", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "task-submit-clean-"));
    tempDirs.push(workspaceDir);

    await execFile("git", ["init", "-b", "main"], { cwd: workspaceDir });
    await execFile("git", ["config", "user.email", "codex@example.com"], { cwd: workspaceDir });
    await execFile("git", ["config", "user.name", "Codex"], { cwd: workspaceDir });
    await fs.writeFile(path.join(workspaceDir, "README.md"), "hello");
    await execFile("git", ["add", "."], { cwd: workspaceDir });
    await execFile("git", ["commit", "-m", "init"], { cwd: workspaceDir });
    await execFile("git", ["checkout", "-b", "task/task-2"], { cwd: workspaceDir });

    const head = await execFile("git", ["rev-parse", "HEAD"], { cwd: workspaceDir });
    const store = new TaskStore(":memory:");
    const task = store.createTask({
      userId: 7,
      agentName: "codex",
      prompt: "no-op",
      workspaceSourcePath: workspaceDir,
    });
    store.updateWorkspacePath(task.id, workspaceDir);
    store.updateTaskStatus(task.id, "completed");

    const submitter = new TaskSubmitter(store);
    const result = await submitter.submitTask(task.id, 7);

    expect(result.committed).toBe(false);
    expect(result.commitHash).toBe(head.stdout.trim());

    store.close();
  });
});
