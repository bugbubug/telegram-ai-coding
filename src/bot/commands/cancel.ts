import type { Bot } from "grammy";

import { ValidationError } from "../../core/errors.js";
import type { Task } from "../../core/types.js";
import type { TaskRunner } from "../../services/task/task-runner.js";
import type { TaskStore } from "../../services/task/task-store.js";
import { replyChunked } from "./task.js";

const extractTaskId = (text: string): string => text.replace(/^\/cancel\s*/u, "").trim();

export const registerCancelCommand = (
  bot: Bot,
  taskRunner: TaskRunner,
  taskStore: TaskStore,
): void => {
  bot.command("cancel", async (ctx) => {
    const explicitTaskId = extractTaskId(ctx.msg?.text ?? "");
    const taskId =
      explicitTaskId ||
      taskStore
        .listTasksByUser(ctx.from?.id ?? 0, ["queued", "running"])
        .at(0)?.id;

    if (!taskId) {
      throw new ValidationError("No active task found to cancel.");
    }

    const task: Task = await taskRunner.cancelTask(taskId);
    await replyChunked(ctx, `Cancelled task ${task.id}.`);
  });
};
