import { describe, expect, it, vi } from "vitest";

import {
  extractSingleTaskId,
  extractSubmitPayload,
  resolveTaskIdForAction,
} from "../../../src/bot/commands/publish-command-utils.js";

describe("publish-command-utils", () => {
  it("extracts submit task id and commit message", () => {
    expect(extractSubmitPayload("/submit task-1 release commit")).toEqual({
      taskId: "task-1",
      commitMessage: "release commit",
    });
  });

  it("extracts a single task id for merge and push commands", () => {
    expect(extractSingleTaskId("/merge task-2", "merge")).toBe("task-2");
    expect(extractSingleTaskId("/push task-3", "push")).toBe("task-3");
  });

  it("uses the task publisher fallback when task id is omitted", async () => {
    const findLatestTaskIdForAction = vi.fn(() => Promise.resolve("task-4"));

    await expect(
      resolveTaskIdForAction("", 42, { findLatestTaskIdForAction } as never, "push"),
    ).resolves.toBe("task-4");

    expect(findLatestTaskIdForAction).toHaveBeenCalledWith(42, "push");
  });
});
