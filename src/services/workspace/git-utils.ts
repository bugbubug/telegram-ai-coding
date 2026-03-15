import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";

const execFile = promisify(execFileCallback);

const runGit = async (cwd: string, args: string[]): Promise<string> => {
  const result = await execFile("git", args, { cwd });
  return result.stdout.trim();
};

export const isGitRepo = async (cwd: string): Promise<boolean> => {
  try {
    const output = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return output === "true";
  } catch {
    return false;
  }
};

export const getRepositoryRoot = async (cwd: string): Promise<string> =>
  runGit(cwd, ["rev-parse", "--show-toplevel"]);

export const getCurrentBranch = async (cwd: string): Promise<string> =>
  runGit(cwd, ["branch", "--show-current"]);

export const createBranch = async (cwd: string, branchName: string): Promise<void> => {
  await runGit(cwd, ["branch", branchName]);
};

export const checkoutBranch = async (cwd: string, branchName: string): Promise<void> => {
  await runGit(cwd, ["checkout", branchName]);
};

export const stageAllChanges = async (cwd: string): Promise<void> => {
  await runGit(cwd, ["add", "-A"]);
};

export const hasPendingChanges = async (cwd: string): Promise<boolean> => {
  const output = await runGit(cwd, ["status", "--porcelain"]);
  return output.length > 0;
};

export const commitAllChanges = async (cwd: string, message: string): Promise<void> => {
  await runGit(cwd, ["commit", "-m", message]);
};

export const getHeadCommit = async (cwd: string): Promise<string> =>
  runGit(cwd, ["rev-parse", "HEAD"]);

export const getHeadCommitForRef = async (cwd: string, ref: string): Promise<string> =>
  runGit(cwd, ["rev-parse", ref]);

export const isAncestorCommit = async (
  cwd: string,
  ancestorRef: string,
  descendantRef: string,
): Promise<boolean> => {
  try {
    await runGit(cwd, ["merge-base", "--is-ancestor", ancestorRef, descendantRef]);
    return true;
  } catch {
    return false;
  }
};

export const mergeBranchFastForward = async (cwd: string, branchName: string): Promise<void> => {
  await runGit(cwd, ["merge", "--ff-only", branchName]);
};

export const hasRemote = async (cwd: string, remoteName: string): Promise<boolean> => {
  try {
    await runGit(cwd, ["remote", "get-url", remoteName]);
    return true;
  } catch {
    return false;
  }
};

export const pushBranch = async (cwd: string, remoteName: string, branchName: string): Promise<void> => {
  await runGit(cwd, ["push", remoteName, branchName]);
};

export const addWorktree = async (
  repoPath: string,
  worktreePath: string,
  branchName: string,
): Promise<void> => {
  await runGit(repoPath, ["worktree", "add", "-b", branchName, worktreePath, "HEAD"]);
};

export interface GitWorktreeEntry {
  path: string;
  branchName?: string;
}

export const listWorktrees = async (repoPath: string): Promise<GitWorktreeEntry[]> => {
  const output = await runGit(repoPath, ["worktree", "list", "--porcelain"]);
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | null = null;

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) {
        entries.push(current);
      }
      current = {
        path: path.resolve(line.slice("worktree ".length)),
      };
      continue;
    }

    if (line.startsWith("branch ") && current) {
      current.branchName = line.slice("branch refs/heads/".length);
      continue;
    }

    if (line.length === 0 && current) {
      entries.push(current);
      current = null;
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
};

export const pruneWorktrees = async (repoPath: string): Promise<void> => {
  await runGit(repoPath, ["worktree", "prune"]);
};

export const removeWorktree = async (repoPath: string, worktreePath: string): Promise<void> => {
  await runGit(repoPath, ["worktree", "remove", "--force", worktreePath]);
};

export const deleteBranch = async (repoPath: string, branchName: string): Promise<void> => {
  await runGit(repoPath, ["branch", "-D", branchName]);
};

export const branchExists = async (repoPath: string, branchName: string): Promise<boolean> => {
  try {
    await runGit(repoPath, ["rev-parse", "--verify", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
};
