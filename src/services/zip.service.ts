import { Readable } from "node:stream";
import unzipper from "unzipper";
import { logger } from "../config/logger";
import { joinS3Key, resolveSafeZipEntryPath } from "../utils/sanitize";
import { S3Service } from "./s3.service";

interface ZipEntryLike extends Readable {
  path: string;
  type: string;
  autodrain(): Readable;
}

export class ZipService {
  constructor(private readonly s3: S3Service) {}

  async extractZipStreamToS3(params: {
    zipStream: Readable;
    extractedBucket: string;
    extractedPrefix: string;
    jobId: string;
  }): Promise<number> {
    const archive = params.zipStream.pipe(unzipper.Parse({ forceStream: true }));
    let fileCount = 0;

    for await (const rawEntry of archive as AsyncIterable<ZipEntryLike>) {
      const entry = rawEntry;

      if (entry.type === "Directory") {
        entry.autodrain();
        continue;
      }

      const safePath = resolveSafeZipEntryPath(entry.path);
      if (!safePath) {
        logger.warn({ jobId: params.jobId, path: entry.path }, "Skipping unsafe zip entry path");
        entry.autodrain();
        continue;
      }

      const key = joinS3Key(params.extractedPrefix, safePath);
      logger.info({ jobId: params.jobId, key }, "Uploading extracted entry");

      await this.s3.uploadStream({
        bucket: params.extractedBucket,
        key,
        body: entry
      });

      fileCount += 1;
    }

    return fileCount;
  }
}
