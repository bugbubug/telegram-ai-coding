import path from "node:path";

import type { Bot } from "grammy";

import type { CommandRegistry } from "../../core/types.js";
import type { RepositorySelectionStore } from "../repository-selection-store.js";
import { replyChunked } from "./task.js";

export const formatStartReply = (
  commandRegistry: CommandRegistry,
  selectedRepositoryPath: string | null,
): string => {
  const pluginCommands = commandRegistry
    .listAgentCommands()
    .map((command) => `/${command.name} - ${command.description}`)
    .join("\n");

  const repositoryLine = selectedRepositoryPath
    ? `当前已选仓库：${path.basename(selectedRepositoryPath)}`
    : "当前未选择仓库，请先使用 /repos 选择。";
  const repositoryPathLine = selectedRepositoryPath ? `仓库路径：${selectedRepositoryPath}` : "";

  return [
    "Telegram AI Manager",
    "",
    repositoryLine,
    repositoryPathLine,
    "",
    "/repos - 选择工作目录下的仓库",
    "/task [workspace::]prompt - 创建任务",
    "/status - 查看当前状态",
    "/logs [task_id] - 查看最近日志",
    "/cancel [task_id] - 取消任务",
    "/clear - 清空当前聊天中的机器人消息并重置仓库选择",
    "/clear all - 清空消息并取消当前活跃任务",
    "/reset - 重置当前会话",
    "",
    "快速开始：",
    "1. /repos 选择仓库",
    "2. /codex 或 /claude",
    "3. 再发送下一条文本作为任务内容",
    "",
    pluginCommands,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

export const registerStartCommand = (
  bot: Bot,
  commandRegistry: CommandRegistry,
  repositorySelectionStore: RepositorySelectionStore,
): void => {
  bot.command("start", async (ctx) => {
    const selectedRepositoryPath = repositorySelectionStore.getSelectedRepository(ctx.from?.id ?? 0);
    await replyChunked(ctx, formatStartReply(commandRegistry, selectedRepositoryPath));
  });
};
