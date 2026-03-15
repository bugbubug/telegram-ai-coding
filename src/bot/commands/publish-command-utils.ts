import { ValidationError } from "../../core/errors.js";
import type { TaskPublisher } from "../../services/task/task-publisher.js";

export const extractTaskPayload = (text: string, commandName: string): string => {
  const pattern = new RegExp(`^/${commandName}\\s*`, "u");
  return text.replace(pattern, "").trim();
};

export const extractSubmitPayload = (
  text: string,
): { taskId: string; commitMessage: string } => {
  const payload = extractTaskPayload(text, "submit");
  if (payload.length === 0) {
    return { taskId: "", commitMessage: "" };
  }

  const [taskId, ...messageParts] = payload.split(/\s+/u);
  return {
    taskId,
    commitMessage: messageParts.join(" ").trim(),
  };
};

export const extractSingleTaskId = (text: string, commandName: string): string =>
  extractTaskPayload(text, commandName).split(/\s+/u).filter(Boolean).at(0) ?? "";

export const resolveTaskIdForAction = async (
  explicitTaskId: string,
  userId: number,
  taskPublisher: TaskPublisher,
  action: "submit" | "merge" | "push",
): Promise<string> => {
  if (explicitTaskId) {
    return explicitTaskId;
  }

  const fallbackTaskId = await taskPublisher.findLatestTaskIdForAction(userId, action);
  if (!fallbackTaskId) {
    throw new ValidationError(`No completed task found to ${action}.`);
  }

  return fallbackTaskId;
};
