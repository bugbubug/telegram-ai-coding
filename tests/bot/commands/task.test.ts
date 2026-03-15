import { describe, expect, it } from "vitest";

import { parseTaskInput } from "../../../src/bot/commands/task.js";

describe("parseTaskInput", () => {
  it("uses the default workspace when no override is provided", () => {
    expect(parseTaskInput("hello world", "/tmp/default")).toEqual({
      prompt: "hello world",
      workspaceSourcePath: "/tmp/default",
    });
  });

  it("supports explicit workspace overrides", () => {
    expect(parseTaskInput("/tmp/project::fix bug", "/tmp/default")).toEqual({
      prompt: "fix bug",
      workspaceSourcePath: "/tmp/project",
    });
  });
});
