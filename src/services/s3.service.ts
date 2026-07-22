import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "node:stream";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { createByteCountingStream } from "../utils/stream";
import { contentTypeFromKey } from "../utils/sanitize";

export interface S3UploadResult {
  key: string;
  size: number;
  contentType: string;
}

export class S3Service {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.awsRegion,
      credentials: {
        accessKeyId: env.awsAccessKeyId,
        secretAccessKey: env.awsSecretAccessKey
      }
    });
  }

  async uploadStream(params: {
    bucket: string;
    key: string;
    body: Readable;
    contentType?: string;
    recordSize?: boolean;
  }): Promise<S3UploadResult> {
    logger.info({ bucket: params.bucket, key: params.key }, "Uploading stream to S3");

    let size = 0;
    const body = params.recordSize
      ? params.body.pipe(createByteCountingStream((chunkSize) => {
          size += chunkSize;
        }))
      : params.body;

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: params.bucket,
        Key: params.key,
        Body: body,
        ContentType: params.contentType ?? contentTypeFromKey(params.key),
        ServerSideEncryption: "AES256"
      },
      queueSize: 4,
      partSize: 64 * 1024 * 1024,
      leavePartsOnError: false
    });

    await upload.done();
    return {
      key: params.key,
      size,
      contentType: params.contentType ?? contentTypeFromKey(params.key)
    };
  }

  async getObjectStream(bucket: string, key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    if (!response.Body || !(response.Body instanceof Readable)) {
      throw new Error(`S3 object stream unavailable for s3://${bucket}/${key}`);
    }

    return response.Body;
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async getObjectMetadata(
    bucket: string,
    key: string
  ): Promise<{ size: number; contentType: string }> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    return {
      size: Number(response.ContentLength ?? 0),
      contentType: response.ContentType ?? contentTypeFromKey(key)
    };
  }
}
