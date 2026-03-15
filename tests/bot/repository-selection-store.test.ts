import { describe, expect, it } from "vitest";

import { RepositorySelectionStore } from "../../src/bot/repository-selection-store.js";

describe("RepositorySelectionStore", () => {
  it("stores and returns selected repositories per user", () => {
    const store = new RepositorySelectionStore();
    store.setSelectedRepository(1, "/tmp/repo-a");
    store.setSelectedRepository(2, "/tmp/repo-b");

    expect(store.getSelectedRepository(1)).toBe("/tmp/repo-a");
    expect(store.getSelectedRepository(2)).toBe("/tmp/repo-b");
  });

  it("clears repository selections", () => {
    const store = new RepositorySelectionStore();
    store.setSelectedRepository(1, "/tmp/repo-a");
    store.clearSelectedRepository(1);

    expect(store.getSelectedRepository(1)).toBeNull();
  });
});
