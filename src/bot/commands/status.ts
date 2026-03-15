import type { Bot } from "grammy";

import type { TaskStore } from "../../services/task/task-store.js";
import { replyChunked } from "./task.js";

export const registerStatusCommand = (bot: Bot, taskStore: TaskStore): void => {
  bot.command("status", async (ctx) => {
    const tasks = taskStore.listTasksByUser(ctx.from?.id ?? 0, ["queued", "running"]);
    if (tasks.length === 0) {
      await replyChunked(ctx, "No queued or running tasks.");
      return;
    }

    await replyChunked(
      ctx,
      tasks
        .map((task) => `${task.id} [${task.status}] ${task.agentName} - ${task.prompt}`)
        .join("\n"),
    );
  });
};
