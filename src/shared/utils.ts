import stripAnsi from "strip-ansi";
import { v4 as uuidv4 } from "uuid";

export const stripAnsiCodes = (value: string): string => stripAnsi(value);

const sliceByLength = (value: string, maxLength: number): string[] => {
  if (value.length <= maxLength) {
    return [value];
  }

  const parts: string[] = [];
  for (let index = 0; index < value.length; index += maxLength) {
    parts.push(value.slice(index, index + maxLength));
  }
  return parts;
};

export const chunkMessage = (value: string, maxLength: number): string[] => {
  if (value.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";

  for (const line of value.split("\n")) {
    const lineParts = sliceByLength(line, maxLength);
    for (let index = 0; index < lineParts.length; index += 1) {
      const part = lineParts[index];
      const suffix = index === lineParts.length - 1 ? "\n" : "";
      const candidate = current.length === 0 ? `${part}${suffix}` : `${current}${part}${suffix}`;
      if (candidate.length <= maxLength) {
        current = candidate;
        continue;
      }

      if (current.length > 0) {
        chunks.push(current.endsWith("\n") ? current.slice(0, -1) : current);
      }
      current = `${part}${suffix}`;
    }
  }

  if (current.length > 0) {
    chunks.push(current.endsWith("\n") ? current.slice(0, -1) : current);
  }

  return chunks;
};

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = `Operation timed out after ${timeoutMs}ms`,
): Promise<T> => {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const generateId = (): string => uuidv4();

export const delay = (timeoutMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
