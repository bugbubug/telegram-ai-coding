import type { Bot } from "grammy";

import type { LoggerLike } from "../../core/types.js";
import type { MessageHistoryStore } from "../message-history-store.js";
import type { PendingTaskInputStore } from "../pending-task-input-store.js";
import type { RepositorySelectionStore } from "../repository-selection-store.js";
import type { TaskRunner } from "../../services/task/task-runner.js";
import { replyChunked } from "./task.js";

export const parseClearMode = (input: string): "messages" | "all" =>
  input.trim().toLowerCase() === "all" ? "all" : "messages";

const deleteTrackedMessages = async (
  bot: Bot,
  chatId: number,
  messageHistoryStore: MessageHistoryStore,
  logger: LoggerLike,
): Promise<number> => {
  const messageIds: number[] = [...messageHistoryStore.list(chatId)].reverse();
  let deletedCount = 0;

  for (const messageId of messageIds) {
    try {
      await bot.api.deleteMessage(chatId, messageId);
      deletedCount += 1;
    } catch (error) {
      logger.warn(
        {
          chatId,
          messageId,
          error,
        },
        "Failed to delete tracked Telegram message",
      );
    }
  }

  messageHistoryStore.clear(chatId);
  logger.info(
    {
      chatId,
      deletedCount,
      trackedCount: messageIds.length,
    },
    "Finished clearing tracked Telegram messages",
  );
  return deletedCount;
};

export const registerClearCommand = (
  bot: Bot,
  messageHistoryStore: MessageHistoryStore,
  repositorySelectionStore: RepositorySelectionStore,
  pendingTaskInputStore: PendingTaskInputStore,
  taskRunner: TaskRunner,
  logger: LoggerLike,
): void => {
  bot.command("clear", async (ctx) => {
    const chatId = typeof ctx.chat?.id === "number" ? ctx.chat.id : undefined;
    const userId = typeof ctx.from?.id === "number" ? ctx.from.id : undefined;
    if (!chatId || !userId) {
      return;
    }

    const mode = parseClearMode(ctx.match ?? "");
    if (mode === "all") {
      await taskRunner.cancelTasksForUser(userId);
    }

    await deleteTrackedMessages(bot, chatId, messageHistoryStore, logger);
    repositorySelectionStore.clearSelectedRepository(userId);
    pendingTaskInputStore.clear(userId);

    const currentMessageId =
      typeof ctx.msg?.message_id === "number" ? ctx.msg.message_id : undefined;
    if (currentMessageId) {
      try {
        await ctx.api.deleteMessage(chatId, currentMessageId);
      } catch {
        // Some clients or chat types may not allow deleting the user's command message.
      }
    }
  });
};

export const registerResetCommand = (
  bot: Bot,
  messageHistoryStore: MessageHistoryStore,
  repositorySelectionStore: RepositorySelectionStore,
  pendingTaskInputStore: PendingTaskInputStore,
  taskRunner: TaskRunner,
  logger: LoggerLike,
): void => {
  bot.command("reset", async (ctx) => {
    const chatId = typeof ctx.chat?.id === "number" ? ctx.chat.id : undefined;
    const userId = typeof ctx.from?.id === "number" ? ctx.from.id : undefined;
    if (!chatId || !userId) {
      return;
    }

    await taskRunner.cancelTasksForUser(userId);
    await deleteTrackedMessages(bot, chatId, messageHistoryStore, logger);
    repositorySelectionStore.clearSelectedRepository(userId);
    pendingTaskInputStore.clear(userId);

    const currentMessageId =
      typeof ctx.msg?.message_id === "number" ? ctx.msg.message_id : undefined;
    if (currentMessageId) {
      try {
        await ctx.api.deleteMessage(chatId, currentMessageId);
      } catch {
        // Some clients or chat types may not allow deleting the user's command message.
      }
    }

    await replyChunked(ctx, "当前会话已重置：已清空机器人消息、取消活跃任务，并重置仓库选择。");
  });
};
