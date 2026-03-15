import { describe, expect, it } from "vitest";

import { InMemoryCommandRegistry } from "../../src/bot/command-registry.js";
import { EventBus } from "../../src/core/event-bus.js";
import { ServiceRegistry } from "../../src/core/service-registry.js";
import type { PluginContext } from "../../src/core/types.js";
import pluginClaudeCode from "../../src/plugins/plugin-claude-code/index.js";
import pluginCodex from "../../src/plugins/plugin-codex/index.js";
import pluginMcp from "../../src/plugins/plugin-mcp/index.js";

describe("plugins", () => {
  it("registers agent shortcut commands", async () => {
    const registry = new InMemoryCommandRegistry();
    const context: PluginContext = {
      eventBus: new EventBus(),
      services: new ServiceRegistry(),
      commandRegistry: registry,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
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
    };

    await pluginCodex.init(context);
    await pluginClaudeCode.init(context);
    await pluginMcp.init(context);

    expect(registry.listAgentCommands()).toEqual([
      {
        name: "codex",
        description: "创建 Codex 任务",
        agentName: "codex",
      },
      {
        name: "claude",
        description: "创建 Claude Code 任务",
        agentName: "claude-code",
      },
    ]);
  });
});
