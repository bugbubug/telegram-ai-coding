import { describe, expect, it } from "vitest";

import { InMemoryCommandRegistry } from "../../../src/bot/command-registry.js";
import { formatStartReply } from "../../../src/bot/commands/start.js";

describe("formatStartReply", () => {
  it("shows repository context and two-step examples", () => {
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

    const reply = formatStartReply(
      registry,
      "/Users/bugbubug/Desktop/codex-project/telegram-ai-coding",
    );

    expect(reply).toContain("当前已选仓库：telegram-ai-coding");
    expect(reply).toContain("仓库路径：/Users/bugbubug/Desktop/codex-project/telegram-ai-coding");
    expect(reply).toContain("1. /repos 选择仓库");
    expect(reply).toContain("2. /codex 或 /claude");
    expect(reply).toContain("3. 再发送下一条文本作为任务内容");
  });

  it("prompts users to select a repository when none is selected", () => {
    const registry = new InMemoryCommandRegistry();

    const reply = formatStartReply(registry, null);

    expect(reply).toContain("当前未选择仓库，请先使用 /repos 选择。");
  });
});
