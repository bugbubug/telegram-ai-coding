import type { Bot } from "grammy";

import type { TaskRunner } from "../../services/task/task-runner.js";
import type { TaskStore } from "../../services/task/task-store.js";
import type { RepositoryCatalog } from "../../services/workspace/repository-catalog.js";
import { formatLogsReply, replyChunked } from "../commands/task.js";
import type { RepositorySelectionStore } from "../repository-selection-store.js";

export const registerCallbackQueryHandler = (
  bot: Bot,
  taskStore: TaskStore,
  taskRunner: TaskRunner,
  repositoryCatalog: RepositoryCatalog,
  repositorySelectionStore: RepositorySelectionStore,
): void => {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("logs:")) {
      const taskId = data.slice("logs:".length);
      await ctx.answerCallbackQuery();
      await replyChunked(ctx, formatLogsReply(taskStore, taskId));
      return;
    }

    if (data.startsWith("cancel:")) {
      const taskId = data.slice("cancel:".length);
      await taskRunner.cancelTask(taskId);
      await ctx.answerCallbackQuery({ text: `Cancelled ${taskId}` });
      return;
    }

    if (data.startsWith("repo:")) {
      const index = Number(data.slice("repo:".length));
      const repository = Number.isNaN(index)
        ? null
        : await repositoryCatalog.getRepository(index);

      if (!repository || !ctx.from?.id) {
        await ctx.answerCallbackQuery({ text: "未找到仓库" });
        return;
      }

      repositorySelectionStore.setSelectedRepository(ctx.from.id, repository.path);
      await ctx.answerCallbackQuery({ text: `已选择 ${repository.name}` });
      await replyChunked(
        ctx,
        `已选择仓库：${repository.name}\n路径：${repository.path}\n现在可以发送 /codex <任务>、/claude <任务>、/task <任务>，或直接发送文本。`,
      );
    }
  });
};
