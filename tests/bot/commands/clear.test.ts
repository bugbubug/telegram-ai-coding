import { describe, expect, it } from "vitest";

import { parseClearMode } from "../../../src/bot/commands/clear.js";

describe("parseClearMode", () => {
  it("defaults to message clearing", () => {
    expect(parseClearMode("")).toBe("messages");
    expect(parseClearMode("something")).toBe("messages");
  });

  it("supports clear all mode", () => {
    expect(parseClearMode("all")).toBe("all");
    expect(parseClearMode(" ALL ")).toBe("all");
  });
});
