import fs from "node:fs/promises";
import path from "node:path";

export interface RepositoryOption {
  index: number;
  name: string;
  path: string;
}

const isGitDirectory = async (candidatePath: string): Promise<boolean> => {
  try {
    const gitPath = path.join(candidatePath, ".git");
    await fs.access(gitPath);
    return true;
  } catch {
    return false;
  }
};

export class RepositoryCatalog {
  public constructor(private readonly baseDir: string) {}

  public async listRepositories(): Promise<RepositoryOption[]> {
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const repositories: Omit<RepositoryOption, "index">[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const repositoryPath = path.join(this.baseDir, entry.name);
      if (await isGitDirectory(repositoryPath)) {
        repositories.push({
          name: entry.name,
          path: repositoryPath,
        });
      }
    }

    repositories.sort((left, right) => left.name.localeCompare(right.name));
    return repositories.map((repository, index) => ({
      index,
      ...repository,
    }));
  }

  public async getRepository(index: number): Promise<RepositoryOption | null> {
    const repositories = await this.listRepositories();
    return repositories.at(index) ?? null;
  }
}
