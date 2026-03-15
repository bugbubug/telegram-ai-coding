import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";

import type { EventBusLike, LoggerLike } from "../../core/types.js";

const QUEUE_NAME = "telegram-ai-manager:tasks";

const createQueue = (connection: Redis) =>
  new Queue<{ taskId: string }>(QUEUE_NAME, {
    connection,
  });

export interface ITaskQueue {
  readonly mode: "redis" | "memory";
  enqueue(taskId: string): Promise<void>;
  remove(taskId: string): Promise<boolean>;
  start(processor: (taskId: string) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryTaskQueue implements ITaskQueue {
  public readonly mode = "memory" as const;

  private readonly queue: string[] = [];
  private processor: ((taskId: string) => Promise<void>) | undefined;
  private drainPromise: Promise<void> | undefined;
  private closed = false;

  public enqueue(taskId: string): Promise<void> {
    this.queue.push(taskId);
    this.scheduleDrain();
    return Promise.resolve();
  }

  public remove(taskId: string): Promise<boolean> {
    const index = this.queue.indexOf(taskId);
    if (index === -1) {
      return Promise.resolve(false);
    }

    this.queue.splice(index, 1);
    return Promise.resolve(true);
  }

  public start(processor: (taskId: string) => Promise<void>): Promise<void> {
    this.processor = processor;
    this.scheduleDrain();
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    this.closed = true;
    this.queue.length = 0;
    await this.drain();
  }

  private scheduleDrain(): void {
    if (this.drainPromise || this.closed || !this.processor) {
      return;
    }

    this.drainPromise = Promise.resolve()
      .then(async () => {
        while (this.queue.length > 0 && !this.closed) {
          const taskId = this.queue.shift();
          if (!taskId) {
            continue;
          }
          await this.processor?.(taskId);
        }
      })
      .finally(() => {
        this.drainPromise = undefined;
        if (this.queue.length > 0 && !this.closed) {
          this.scheduleDrain();
        }
      });
  }

  private async drain(): Promise<void> {
    const pendingDrain = this.drainPromise;
    if (pendingDrain) {
      try {
        await pendingDrain;
      } catch {
        // Processor errors are handled by the runner; closing should still proceed.
      }
    }
  }
}

export class RedisTaskQueue implements ITaskQueue {
  public readonly mode = "redis" as const;

  private readonly queue: ReturnType<typeof createQueue>;
  private readonly workerConnection: Redis;
  private worker: Worker<{ taskId: string }> | undefined;

  public constructor(
    private readonly queueConnection: Redis,
    private readonly concurrency: number,
  ) {
    this.workerConnection = this.queueConnection.duplicate({
      maxRetriesPerRequest: null,
    });
    this.queue = createQueue(this.queueConnection);
  }

  public async enqueue(taskId: string): Promise<void> {
    await this.queue.add("task", { taskId }, { jobId: taskId });
  }

  public async remove(taskId: string): Promise<boolean> {
    const job = await this.queue.getJob(taskId);
    if (!job) {
      return false;
    }

    await job.remove();
    return true;
  }

  public start(processor: (taskId: string) => Promise<void>): Promise<void> {
    this.worker = new Worker<{ taskId: string }>(
      QUEUE_NAME,
      async (job) => processor(job.data.taskId),
      {
        connection: this.workerConnection,
        concurrency: this.concurrency,
      },
    );
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.workerConnection.quit();
    await this.queueConnection.quit();
  }
}

export class TaskQueue {
  public static async create(
    redisUrl: string,
    concurrency: number,
    eventBus: EventBusLike,
    logger: LoggerLike,
  ): Promise<ITaskQueue> {
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    try {
      await connection.connect();
      await connection.ping();
      logger.info({ redisUrl }, "Redis task queue enabled");
      return new RedisTaskQueue(connection, concurrency);
    } catch (error) {
      eventBus.emit("queue:degraded", {
        reason: "Redis unavailable, using in-memory queue",
      });
      logger.warn({ error }, "Redis unavailable, falling back to in-memory queue");
      connection.disconnect();
      return new InMemoryTaskQueue();
    }
  }
}
