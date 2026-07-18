import http from "node:http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { createApp } from "./app";
import { QueueService } from "./services/queue.service";
import { GraphService } from "./services/graph.service";
import { S3Service } from "./services/s3.service";
import { ZipService } from "./services/zip.service";
import { CallbackService } from "./services/callback.service";
import { ProcessWorker } from "./workers/process.worker";

async function main(): Promise<void> {
  const queueService = new QueueService();
  const graphService = new GraphService();
  const s3Service = new S3Service();
  const zipService = new ZipService(s3Service);
  const callbackService = new CallbackService();
  const processWorker = new ProcessWorker(graphService, s3Service, zipService, callbackService);

  const worker = queueService.createWorker((job) => processWorker.handle(job));
  const app = createApp(queueService);
  const server = http.createServer(app);
  let shuttingDown = false;

  const port = env.port;
  server.listen(port, () => {
    logger.info({ port }, "HTTP server listening");
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await worker.close();
    await queueService.close();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection");
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ error }, "Uncaught exception");
    void shutdown("uncaughtException").finally(() => process.exit(1));
  });
}

void main().catch((error) => {
  logger.fatal({ error }, "Failed to start service");
  process.exit(1);
});
