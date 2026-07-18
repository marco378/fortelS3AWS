import { Request, Response } from "express";
import { QueueService } from "../services/queue.service";
import { assertHttpUrl, assertNonEmptyString, optionalHttpUrl } from "../utils/validation";

export class ProcessController {
  constructor(private readonly queueService: QueueService) {}

  handleProcess = async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = assertNonEmptyString(req.body?.jobId, "jobId");
      const projectName = assertNonEmptyString(req.body?.projectName, "projectName");
      const downloadUrl = assertHttpUrl(assertNonEmptyString(req.body?.downloadUrl, "downloadUrl"), "downloadUrl");
      const callbackUrl = optionalHttpUrl(req.body?.callbackUrl, "callbackUrl");
      const callbackToken =
        typeof req.body?.callbackToken === "string" && req.body.callbackToken.trim()
          ? req.body.callbackToken.trim()
          : undefined;

      await this.queueService.enqueue({
        jobId,
        downloadUrl,
        projectName,
        callbackUrl,
        callbackToken
      });

      res.status(202).json({
        status: "queued",
        jobId
      });
    } catch (error) {
      res.status(400).json({
        status: "error",
        message: error instanceof Error ? error.message : "Invalid request"
      });
    }
  };
}
