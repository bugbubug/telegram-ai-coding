import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OutputBuffer } from "../../../src/services/terminal/output-buffer.js";

describe("OutputBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes buffered output after the debounce window", () => {
    const onFlush = vi.fn();
    const buffer = new OutputBuffer(onFlush, 500, 4096);

    buffer.append("hello");
    buffer.append(" world");

    vi.advanceTimersByTime(499);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledWith("hello world");
  });

  it("strips ansi codes and chunks oversized payloads", () => {
    const chunks: string[] = [];
    const buffer = new OutputBuffer((chunk) => {
      chunks.push(chunk);
    }, 10, 4);

    buffer.append("\u001B[31mabcdef\u001B[0m");
    vi.advanceTimersByTime(10);

    expect(chunks).toEqual(["abcd", "ef"]);
  });
});
