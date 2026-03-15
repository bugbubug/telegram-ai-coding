import { afterEach, describe, expect, it, vi } from "vitest";

import type { LoggerLike } from "../../src/core/types.js";
import { createRuntimeHealthServer } from "../../src/runtime/health-server.js";

const logger: LoggerLike = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

let serverUnderTest:
  | Awaited<ReturnType<typeof createRuntimeHealthServer>>
  | null = null;

afterEach(async () => {
  if (serverUnderTest) {
    await serverUnderTest.close();
    serverUnderTest = null;
  }
});

describe("createRuntimeHealthServer", () => {
  it("reports starting, ready, and stopping states over http", async () => {
    serverUnderTest = await createRuntimeHealthServer({
      host: "127.0.0.1",
      port: 0,
      logger,
    });

    const startingResponse = await fetch(`http://${serverUnderTest.host}:${serverUnderTest.port}/healthz`);
    expect(startingResponse.status).toBe(503);
    expect(await startingResponse.json()).toMatchObject({
      status: "starting",
      pid: process.pid,
    });

    serverUnderTest.setReady();
    const readyResponse = await fetch(`http://${serverUnderTest.host}:${serverUnderTest.port}/healthz`);
    expect(readyResponse.status).toBe(200);
    expect(await readyResponse.json()).toMatchObject({
      status: "ready",
      pid: process.pid,
    });

    serverUnderTest.setStopping();
    const stoppingResponse = await fetch(`http://${serverUnderTest.host}:${serverUnderTest.port}/healthz`);
    expect(stoppingResponse.status).toBe(503);
    expect(await stoppingResponse.json()).toMatchObject({
      status: "stopping",
      pid: process.pid,
    });
  });
});
