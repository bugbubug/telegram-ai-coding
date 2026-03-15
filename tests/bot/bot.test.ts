import { describe, expect, it } from "vitest";

import { InMemoryCommandRegistry } from "../../src/bot/command-registry.js";
import { buildBotCommands } from "../../src/bot/bot.js";

describe("buildBotCommands", () => {
  it("includes built-in and plugin commands", () => {
    const registry = new InMemoryCommandRegistry();
    registry.registerAgentCommand({
      name: "codex",
      description: "创建 Codex 任务",
      agentName: "codex",
    });
    registry.registerAgentCommand({
      name: "claude",
      description: "创建 Claude Code 任务",
      agentName: "claude-code",
    });

    expect(buildBotCommands(registry)).toEqual([
      { command: "start", description: "显示可用命令" },
      {
        command: "repos",
        description: "选择工作目录下的仓库",
      },
      { command: "task", description: "在已选仓库中创建任务" },
      { command: "status", description: "查看排队中和运行中的任务" },
      { command: "logs", description: "查看任务最近日志" },
      { command: "cancel", description: "取消排队中或运行中的任务" },
      { command: "submit", description: "提交已完成任务的本地分支" },
      { command: "clear", description: "清空当前聊天中的机器人消息" },
      { command: "reset", description: "重置当前会话并取消活跃任务" },
      { command: "codex", description: "创建 Codex 任务" },
      { command: "claude", description: "创建 Claude Code 任务" },
    ]);
  });
});
