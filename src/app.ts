import express from "express";
import { createHealthRouter } from "./routes/health.route";
import { createProcessRouter } from "./routes/process.route";
import { ProcessController } from "./controllers/process.controller";
import { QueueService } from "./services/queue.service";
import { errorMiddleware } from "./middleware/error.middleware";

export function createApp(queueService: QueueService): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  const controller = new ProcessController(queueService);
  app.use(createHealthRouter());
  app.use(createProcessRouter(controller));

  app.use((_req, res) => {
    res.status(404).json({ status: "error", message: "Not found" });
  });

  app.use(errorMiddleware);

  return app;
}
