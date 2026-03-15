import { describe, expect, it, vi } from "vitest";

import { InMemoryTaskQueue } from "../../../src/services/task/task-queue.js";

const createDeferred = (): {
  promise: Promise<void>;
  resolve: () => void;
} => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((innerResolve) => {
    resolve = (): void => {
      innerResolve();
    };
  });
  return { promise, resolve };
};

describe("InMemoryTaskQueue", () => {
  it("does not block enqueue while a task is being processed", async () => {
    const queue = new InMemoryTaskQueue();
    const deferred = createDeferred();
    const processor = vi.fn(async () => {
      await deferred.promise;
    });

    await queue.start(processor);

    let enqueueResolved = false;
    const enqueuePromise = queue.enqueue("task-1").then(() => {
      enqueueResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(processor).toHaveBeenCalledWith("task-1");
    expect(enqueueResolved).toBe(true);

    deferred.resolve();
    await enqueuePromise;
    await queue.close();
  });

  it("processes queued tasks in order", async () => {
    const queue = new InMemoryTaskQueue();
    const handled: string[] = [];

    await queue.start((taskId) => {
      handled.push(taskId);
      return Promise.resolve();
    });

    await queue.enqueue("task-1");
    await queue.enqueue("task-2");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toEqual(["task-1", "task-2"]);
    await queue.close();
  });
});
