import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryCatalog } from "../../../src/services/workspace/repository-catalog.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("RepositoryCatalog", () => {
  it("lists git repositories under the base directory", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-catalog-"));
    tempDirs.push(baseDir);

    const repoA = path.join(baseDir, "repo-a");
    const repoB = path.join(baseDir, "repo-b");
    const notRepo = path.join(baseDir, "notes");

    await fs.mkdir(path.join(repoA, ".git"), { recursive: true });
    await fs.mkdir(path.join(repoB, ".git"), { recursive: true });
    await fs.mkdir(notRepo, { recursive: true });

    const catalog = new RepositoryCatalog(baseDir);
    const repositories = await catalog.listRepositories();

    expect(repositories.map((repository) => repository.name)).toEqual(["repo-a", "repo-b"]);
    expect(repositories.map((repository) => repository.index)).toEqual([0, 1]);
  });

  it("returns a repository by index", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-catalog-"));
    tempDirs.push(baseDir);

    const repoA = path.join(baseDir, "repo-a");
    await fs.mkdir(path.join(repoA, ".git"), { recursive: true });

    const catalog = new RepositoryCatalog(baseDir);
    const repository = await catalog.getRepository(0);

    expect(repository?.name).toBe("repo-a");
    expect(await catalog.getRepository(1)).toBeNull();
  });
});
