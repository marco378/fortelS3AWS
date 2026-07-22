import axios, { AxiosInstance } from "axios";
import { Readable } from "node:stream";
import { env } from "../config/env";
import { logger } from "../config/logger";

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
}

interface UploadSessionResponse {
  uploadUrl: string;
  expirationDateTime?: string;
}

interface GraphItemResponse {
  id: string;
  name: string;
  size?: number;
  file?: {
    mimeType?: string;
  };
}

function normalizeGraphPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/^\.+/, "");
}

function joinGraphPath(...segments: string[]): string {
  return segments
    .map((segment) => normalizeGraphPath(segment))
    .filter(Boolean)
    .join("/");
}

async function* chunkReadable(stream: Readable, chunkSize: number): AsyncGenerator<Buffer> {
  let buffer = Buffer.alloc(0);

  for await (const chunk of stream) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    buffer = Buffer.concat([buffer, data]);

    while (buffer.length >= chunkSize) {
      yield buffer.subarray(0, chunkSize);
      buffer = buffer.subarray(chunkSize);
    }
  }

  if (buffer.length > 0) {
    yield buffer;
  }
}

export class GraphService {
  private readonly http: AxiosInstance;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor() {
    this.http = axios.create({
      baseURL: "https://graph.microsoft.com/v1.0",
      timeout: 30_000
    });
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt - 60_000 > now) {
      return this.tokenCache.token;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.graphTenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: env.graphClientId,
      client_secret: env.graphClientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default"
    });

    const response = await axios.post<GraphTokenResponse>(tokenUrl, body, {
      timeout: 30_000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const token = response.data.access_token;
    this.tokenCache = {
      token,
      expiresAt: now + Math.max(response.data.expires_in - 60, 60) * 1000
    };

    return token;
  }

  private async authedRequest<T>(
    method: "GET" | "POST" | "PUT",
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const token = await this.getAccessToken();
    const response = await this.http.request<T>({
      method,
      url,
      data: body,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(headers ?? {})
      },
      validateStatus: (status) => status >= 200 && status < 300
    });
    return response.data;
  }

  async ensureFolderPath(folderPath: string): Promise<void> {
    const normalized = normalizeGraphPath(folderPath);
    if (!normalized) {
      return;
    }

    const segments = normalized.split("/").filter(Boolean);
    let currentPath = "";

    for (const segment of segments) {
      const parentPath = currentPath;
      try {
        const parentEndpoint = parentPath
          ? `/drives/${encodeURIComponent(env.graphDriveId)}/root:/${parentPath}:/children`
          : `/drives/${encodeURIComponent(env.graphDriveId)}/root/children`;

        await this.authedRequest<GraphItemResponse>("POST", parentEndpoint, {
          name: segment,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail"
        });
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status === 409) {
          currentPath = currentPath ? `${currentPath}/${segment}` : segment;
          continue;
        }
        if (status === 400) {
          currentPath = currentPath ? `${currentPath}/${segment}` : segment;
          continue;
        }
        throw error;
      }

      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    }
  }

  async uploadFileToDrive(params: {
    relativePath: string;
    body: Readable;
    size: number;
    contentType: string;
  }): Promise<void> {
    const normalizedRelativePath = normalizeGraphPath(params.relativePath);
    const targetPath = joinGraphPath(env.graphTargetFolder, normalizedRelativePath);
    const parentPath = normalizedRelativePath.includes("/")
      ? joinGraphPath(env.graphTargetFolder, normalizedRelativePath.split("/").slice(0, -1).join("/"))
      : normalizeGraphPath(env.graphTargetFolder);

    logger.info({ targetPath }, "Uploading file to SharePoint");
    await this.ensureFolderPath(parentPath);

    if (params.size === 0 || params.size <= 4 * 1024 * 1024) {
      await this.uploadSmallFile(targetPath, params.body, params.contentType);
      return;
    }

    await this.uploadLargeFile(targetPath, params.body, params.size, params.contentType);
  }

  private async uploadSmallFile(targetPath: string, body: Readable, contentType: string): Promise<void> {
    const token = await this.getAccessToken();
    await this.http.put(
      `/drives/${encodeURIComponent(env.graphDriveId)}/root:/${targetPath}:/content`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: (status) => status >= 200 && status < 300
      }
    );
  }

  private async uploadLargeFile(
    targetPath: string,
    body: Readable,
    size: number,
    contentType: string
  ): Promise<void> {
    const session = await this.authedRequest<UploadSessionResponse>(
      "POST",
      `/drives/${encodeURIComponent(env.graphDriveId)}/root:/${targetPath}:/createUploadSession`,
      {
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
          name: targetPath.split("/").pop()
        }
      }
    );

    const chunkSize = 10 * 1024 * 1024;
    let start = 0;

    for await (const chunk of chunkReadable(body, chunkSize)) {
      const end = Math.min(start + chunk.length - 1, size - 1);
      await axios.put(session.uploadUrl, chunk, {
        headers: {
          "Content-Length": chunk.length,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Type": contentType
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: (status) => status === 201 || status === 202
      });
      start = end + 1;
    }
  }
}
