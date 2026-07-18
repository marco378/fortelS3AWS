import { Request, Response } from "express";
import { QueueService } from "../services/queue.service";
import { assertHttpUrl, assertNonEmptyString } from "../utils/validation";
import { sanitizePrefix } from "../utils/sanitize";

export class ProcessController {
  constructor(private readonly queueService: QueueService) {}

  handleProcess = async (req: Request, res: Response): Promise<void> => {
    try {
      const jobId = assertNonEmptyString(req.body?.jobId, "jobId");
      const projectName = sanitizePrefix(assertNonEmptyString(req.body?.projectName, "projectName"));
      const sharepointUrl = assertHttpUrl(assertNonEmptyString(req.body?.sharepointUrl, "sharepointUrl"), "sharepointUrl");
      const callbackUrl = assertHttpUrl(assertNonEmptyString(req.body?.callbackUrl, "callbackUrl"), "callbackUrl");

      await this.queueService.enqueue({
        jobId,
        projectName,
        sharepointUrl,
        callbackUrl
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
