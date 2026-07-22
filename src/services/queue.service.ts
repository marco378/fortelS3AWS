import { Queue, Worker, JobsOptions, WorkerOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ProcessJobData } from "../types/jobs";

export const PROCESS_QUEUE_NAME = "zip-process";

export class QueueService {
  private readonly connection: IORedis;
  private readonly queue: Queue<ProcessJobData>;

  constructor() {
    this.connection = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false
    });

    this.queue = new Queue<ProcessJobData>(PROCESS_QUEUE_NAME, {
      connection: this.connection
    });
  }

  async enqueue(job: ProcessJobData): Promise<string> {
    logger.info({ jobId: job.jobId }, "Enqueuing job");
    const options: JobsOptions = {
      jobId: job.jobId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: {
        age: 24 * 60 * 60,
        count: 1000
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60
      }
    };

    const queued = await this.queue.add("process", job, options);
    logger.info({ jobId: queued.id ?? job.jobId }, "Job enqueued");
    return queued.id ?? job.jobId;
  }

  createWorker(
    processor: (job: import("bullmq").Job<ProcessJobData>) => Promise<unknown>
  ): Worker<ProcessJobData> {
    const options: WorkerOptions = {
      connection: this.connection,
      concurrency: 1,
      lockDuration: 60 * 60 * 1000,
      stalledInterval: 60_000,
      maxStalledCount: 1
    };

    const worker = new Worker<ProcessJobData>(PROCESS_QUEUE_NAME, processor, options);

    worker.on("ready", () => {
      logger.info({ queue: PROCESS_QUEUE_NAME }, "BullMQ worker ready");
    });

    worker.on("active", (job) => {
      logger.info({ jobId: job.id }, "BullMQ job active");
    });

    worker.on("completed", (job) => {
      logger.info({ jobId: job.id }, "BullMQ job completed");
    });

    worker.on("failed", (job, error) => {
      logger.error(
        { jobId: job?.id, attemptsMade: job?.attemptsMade, error },
        "BullMQ job failed"
      );
    });

    worker.on("stalled", (jobId) => {
      logger.warn({ jobId }, "BullMQ job stalled");
    });

    worker.on("error", (error) => {
      logger.error({ error }, "BullMQ worker error");
    });

    return worker;
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
