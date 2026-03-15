import { describe, expect, it, vi } from "vitest";

import { EventBus } from "../../src/core/event-bus.js";
import { PluginManager } from "../../src/core/plugin-manager.js";
import { ServiceRegistry } from "../../src/core/service-registry.js";
import type { PluginContext } from "../../src/core/types.js";

const createContext = (): PluginContext => ({
  eventBus: new EventBus(),
  services: new ServiceRegistry(),
  commandRegistry: {
    registerAgentCommand: vi.fn(),
    listAgentCommands: vi.fn(() => []),
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  config: {
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_ALLOWED_USERS: [1],
    CODEX_CLI_PATH: "codex",
    CODEX_CLI_ARGS: [],
    CLAUDE_CODE_CLI_PATH: "claude",
    CLAUDE_CODE_CLI_ARGS: [],
    WORKSPACE_BASE_DIR: "/tmp",
    DEFAULT_WORKSPACE_SOURCE_PATH: "/tmp",
    GIT_BRANCH_ISOLATION: false,
    REDIS_URL: "redis://localhost:6379",
    TASK_CONCURRENCY: 1,
    RUNTIME_HEALTH_HOST: "127.0.0.1",
    RUNTIME_HEALTH_PORT: 43117,
    LOG_LEVEL: "info",
  },
});

describe("PluginManager", () => {
  it("loads plugins in dependency order and destroys in reverse", async () => {
    const order: string[] = [];
    const manager = new PluginManager([
      {
        name: "plugin-b",
        dependencies: ["plugin-a"],
        init: () => {
          order.push("init-b");
        },
        destroy: () => {
          order.push("destroy-b");
        },
      },
      {
        name: "plugin-a",
        init: () => {
          order.push("init-a");
        },
        destroy: () => {
          order.push("destroy-a");
        },
      },
    ]);

    await manager.loadAll(createContext());
    await manager.destroyAll();

    expect(order).toEqual(["init-a", "init-b", "destroy-b", "destroy-a"]);
  });

  it("throws on cyclic dependencies", async () => {
    const manager = new PluginManager([
      { name: "a", dependencies: ["b"], init: () => undefined },
      { name: "b", dependencies: ["a"], init: () => undefined },
    ]);

    await expect(manager.loadAll(createContext())).rejects.toThrow("cycle");
  });
});
