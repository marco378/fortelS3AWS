import { Job } from "bullmq";
import axios from "axios";
import { Readable } from "node:stream";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  CompletedJobResult,
  FailedJobResult,
  ManifestDocument,
  ProcessJobData,
  ProcessJobResult
} from "../types/jobs";
import { CallbackService } from "../services/callback.service";
import { GraphService } from "../services/graph.service";
import { S3Service } from "../services/s3.service";
import { ZipService } from "../services/zip.service";
import { joinS3Key } from "../utils/sanitize";

function deriveZipName(projectName: string): string {
  const trimmed = projectName.trim();
  return trimmed.toLowerCase().endsWith(".zip") ? trimmed : `${trimmed}.zip`;
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "Unknown worker failure";
}

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
      const extractedPrefix = `${data.jobId}/`;
      const incomingKey = joinS3Key(extractedPrefix, "original.zip");

      log.info({ downloadUrl: data.downloadUrl }, "Downloading ZIP stream");
      const downloadStream = await this.downloadZipStream(data.downloadUrl);

      log.info({ incomingKey }, "Uploading original ZIP to S3");
      const originalZipUpload = await this.s3Service.uploadStream({
        bucket: env.s3IncomingBucket,
        key: incomingKey,
        body: downloadStream,
        contentType: "application/zip",
        recordSize: true
      });

      log.info({ incomingKey, size: originalZipUpload.size }, "Original ZIP uploaded");

      const storedZipStream = await this.s3Service.getObjectStream(env.s3IncomingBucket, incomingKey);

      log.info("Extracting ZIP from S3");
      const extraction = await this.zipService.extractZipStreamToS3({
        zipStream: storedZipStream,
        extractedBucket: env.s3ExtractedBucket,
        extractedPrefix: extractedPrefix,
        jobId: data.jobId
      });

      const zipName = deriveZipName(data.projectName);
      const manifest: ManifestDocument = {
        jobId: data.jobId,
        createdAt: new Date().toISOString(),
        zipName,
        fileCount: extraction.fileCount,
        files: extraction.files.map((file) => ({
          key: file.key,
          size: file.size,
          contentType: file.contentType
        }))
      };

      const manifestKey = joinS3Key(extractedPrefix, "manifest.json");
      log.info({ manifestKey }, "Uploading manifest");
      await this.s3Service.uploadStream({
        bucket: env.s3ExtractedBucket,
        key: manifestKey,
        body: Readable.from(Buffer.from(JSON.stringify(manifest, null, 2), "utf8")),
        contentType: "application/json"
      });

      const result: CompletedJobResult = {
        jobId: data.jobId,
        status: "completed",
        bucket: env.s3ExtractedBucket,
        prefix: extractedPrefix,
        fileCount: extraction.fileCount,
        files: extraction.files.map((file) => file.relativePath)
      };

      log.info(
        { fileCount: extraction.fileCount, prefix: extractedPrefix, manifestKey },
        "Extraction completed"
      );

      await this.uploadToSharePoint({
        jobId: data.jobId,
        files: extraction.files
      });

      if (data.callbackUrl) {
        try {
          await this.callbackService.sendCallback(data.callbackUrl, result, data.callbackToken);
          log.info("Callback delivered");
        } catch (callbackError) {
          log.error({ callbackError }, "Success callback delivery failed");
        }
      }

      return result;
    } catch (error) {
      const failure: FailedJobResult = {
        jobId: data.jobId,
        status: "failed",
        error: toFailureMessage(error)
      };

      log.error({ error: failure.error }, "Job failed");

      const isFinalAttempt = (job.attemptsMade + 1) >= (job.opts.attempts ?? 1);
      if (isFinalAttempt && data.callbackUrl) {
        try {
          await this.callbackService.sendCallback(data.callbackUrl, failure, data.callbackToken);
          log.info("Failure callback delivered");
        } catch (callbackError) {
          log.error({ callbackError }, "Failure callback delivery failed");
        }
      }

      throw error;
    }
  }

  private async downloadZipStream(downloadUrl: string): Promise<Readable> {
    const response = await axios.get(downloadUrl, {
      responseType: "stream",
      timeout: 0,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (status) => status >= 200 && status < 300
    });

    if (!response.data) {
      throw new Error("Failed to download ZIP");
    }

    return response.data as Readable;
  }

  private async uploadToSharePoint(params: {
    jobId: string;
    files: { key: string; relativePath: string; size: number; contentType: string }[];
  }): Promise<void> {
    const targetRoot = joinS3Key(env.graphTargetFolder, params.jobId);
    logger.info({ jobId: params.jobId, targetRoot }, "Uploading extracted files to SharePoint");

    await this.graphService.ensureFolderPath(targetRoot);

    for (const file of params.files) {
      const s3Stream = await this.s3Service.getObjectStream(env.s3ExtractedBucket, file.key);
      await this.graphService.uploadFileToDrive({
        relativePath: joinS3Key(params.jobId, file.relativePath),
        body: s3Stream,
        size: file.size,
        contentType: file.contentType
      });
    }
  }
}
