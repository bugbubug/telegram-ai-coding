import { describe, expect, it } from "vitest";

import { chunkMessage, delay, generateId, stripAnsiCodes, withTimeout } from "../../src/shared/utils.js";

describe("shared/utils", () => {
  it("chunks an empty string into no messages", () => {
    expect(chunkMessage("", 4096)).toEqual([]);
  });

  it("keeps a message at the exact boundary intact", () => {
    const message = "a".repeat(4096);
    expect(chunkMessage(message, 4096)).toEqual([message]);
  });

  it("splits long single lines by the hard limit", () => {
    const chunks = chunkMessage("a".repeat(5000), 4096);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(4096);
    expect(chunks[1]).toHaveLength(904);
  });

  it("prefers newline boundaries before hard cutting", () => {
    const chunks = chunkMessage(`hello\n${"a".repeat(10)}\nworld`, 12);
    expect(chunks).toEqual(["hello", "aaaaaaaaaa", "world"]);
  });

  it("strips ansi codes", () => {
    expect(stripAnsiCodes("\u001B[31merror\u001B[0m")).toBe("error");
  });

  it("rejects when the timeout elapses", async () => {
    await expect(withTimeout(delay(20), 1, "timeout")).rejects.toThrow("timeout");
  });

  it("returns the underlying value before timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 10)).resolves.toBe("ok");
  });

  it("generates unique ids", () => {
    expect(generateId()).not.toBe(generateId());
  });
});
