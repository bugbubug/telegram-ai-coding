import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

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

export const getCurrentBranch = async (cwd: string): Promise<string> =>
  runGit(cwd, ["branch", "--show-current"]);

export const createBranch = async (cwd: string, branchName: string): Promise<void> => {
  await runGit(cwd, ["branch", branchName]);
};

export const checkoutBranch = async (cwd: string, branchName: string): Promise<void> => {
  await runGit(cwd, ["checkout", branchName]);
};
