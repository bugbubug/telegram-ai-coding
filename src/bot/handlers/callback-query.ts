import type { Bot } from "grammy";

import type { TaskPublisher } from "../../services/task/task-publisher.js";
import type { TaskRunner } from "../../services/task/task-runner.js";
import type { TaskStore } from "../../services/task/task-store.js";
import type { RepositoryCatalog } from "../../services/workspace/repository-catalog.js";
import {
  buildActionKeyboard,
  buildConfirmationKeyboard,
  formatActionConfirmationPrompt,
  formatMergeReply,
  formatPushReply,
  formatSubmitReply,
} from "../commands/publish-command-utils.js";
import { formatLogsReply, replyChunked } from "../commands/task.js";
import type { RepositorySelectionStore } from "../repository-selection-store.js";

export const registerCallbackQueryHandler = (
  bot: Bot,
  taskStore: TaskStore,
  taskPublisher: TaskPublisher,
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

    if (data.startsWith("publish:prompt:")) {
      const [, , action, taskId] = data.split(":");
      if ((action !== "merge" && action !== "push") || !taskId) {
        await ctx.answerCallbackQuery({ text: "无效操作" });
        return;
      }

      await ctx.answerCallbackQuery();
      await ctx.reply(formatActionConfirmationPrompt(action, taskId), {
        reply_markup: buildConfirmationKeyboard(action, taskId),
      });
      return;
    }

    if (data.startsWith("publish:run:submit:")) {
      const taskId = data.slice("publish:run:submit:".length);
      if (!taskId) {
        await ctx.answerCallbackQuery({ text: "无效操作" });
        return;
      }

      const userId = ctx.from?.id ?? 0;
      await ctx.answerCallbackQuery({ text: "正在提交..." });
      const result = await taskPublisher.submitTask(taskId, userId);
      await ctx.editMessageText(formatSubmitReply(result), {
        reply_markup: buildActionKeyboard("merge", taskId),
      });
      return;
    }

    if (data.startsWith("publish:cancel:")) {
      const [, , action, taskId] = data.split(":");
      if ((action !== "merge" && action !== "push") || !taskId) {
        await ctx.answerCallbackQuery({ text: "无效操作" });
        return;
      }

      await ctx.answerCallbackQuery({ text: "已取消" });
      await ctx.editMessageText(`已取消${action === "merge" ? "合并" : "推送"} ${taskId}`, {
        reply_markup: buildActionKeyboard(action, taskId),
      });
      return;
    }

    if (data.startsWith("publish:confirm:")) {
      const [, , action, taskId] = data.split(":");
      if ((action !== "merge" && action !== "push") || !taskId) {
        await ctx.answerCallbackQuery({ text: "无效操作" });
        return;
      }

      const userId = ctx.from?.id ?? 0;
      await ctx.answerCallbackQuery({
        text: action === "merge" ? "正在合并..." : "正在推送...",
      });

      if (action === "merge") {
        const result = await taskPublisher.mergeTask(taskId, userId);
        await ctx.editMessageText(formatMergeReply(result), {
          reply_markup: buildActionKeyboard("push", taskId),
        });
        return;
      }

      const result = await taskPublisher.pushTask(taskId, userId);
      await ctx.editMessageText(formatPushReply(result));
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
