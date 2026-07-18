import { Job } from "bullmq";
import axios from "axios";
import { Readable } from "node:stream";
import { logger } from "../config/logger";
import { env } from "../config/env";
import { ProcessJobData, ProcessJobResult } from "../types/jobs";
import { CallbackService } from "../services/callback.service";
import { GraphService } from "../services/graph.service";
import { S3Service } from "../services/s3.service";
import { ZipService } from "../services/zip.service";
import { joinS3Key, sanitizePrefix } from "../utils/sanitize";

export class ProcessWorker {
  constructor(
    private readonly graphService: GraphService,
    private readonly s3Service: S3Service,
    private readonly zipService: ZipService,
    private readonly callbackService: CallbackService
  ) {}

  async handle(job: Job<ProcessJobData>): Promise<ProcessJobResult> {
    const data = job.data;
    const log = logger.child({
      jobId: data.jobId,
      projectName: data.projectName
    });

    try {
      log.info("Job started");
      const prefixBase = sanitizePrefix(data.projectName || data.jobId);
      const extractedPrefix = prefixBase.endsWith("/") ? prefixBase : `${prefixBase}/`;
      const incomingKey = joinS3Key(extractedPrefix, "original.zip");

      log.info("Resolving SharePoint link");
      const resolved = await this.graphService.resolveShareUrl(data.sharepointUrl);

      log.info(
        { driveItemId: resolved.driveItemId, sourceName: resolved.name },
        "Downloading ZIP from SharePoint and uploading to S3"
      );
      const downloadStream = await this.downloadZipToS3({
        downloadUrl: resolved.downloadUrl,
        incomingKey
      });

      log.info("Extracting ZIP from incoming S3 object");
      const fileCount = await this.zipService.extractZipStreamToS3({
        zipStream: downloadStream,
        extractedBucket: env.s3ExtractedBucket,
        extractedPrefix: extractedPrefix,
        jobId: data.jobId
      });

      const result: ProcessJobResult = {
        jobId: data.jobId,
        status: "completed",
        bucket: env.s3ExtractedBucket,
        prefix: extractedPrefix,
        fileCount
      };

      log.info({ fileCount, prefix: extractedPrefix }, "Extraction completed");
      await this.callbackService.sendCallback(data.callbackUrl, result);
      log.info("Callback delivered");

      return result;
    } catch (error) {
      log.error({ error }, "Job failed");
      throw error;
    }
  }

  private async downloadZipToS3(params: {
    downloadUrl: string;
    incomingKey: string;
  }) {
    const response = await axios.get(params.downloadUrl, {
      responseType: "stream",
      timeout: 0,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (status) => status >= 200 && status < 300
    });

    if (!response.data) {
      throw new Error("Failed to download ZIP from SharePoint");
    }

    const downloadStream = response.data as Readable;
    await this.s3Service.uploadStream({
      bucket: env.s3IncomingBucket,
      key: params.incomingKey,
      body: downloadStream,
      contentType: "application/zip"
    });

    return await this.s3Service.getObjectStream(env.s3IncomingBucket, params.incomingKey);
  }
}
