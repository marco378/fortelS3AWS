import axios, { AxiosInstance } from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface SharePointDriveItemResponse {
  id: string;
  name?: string;
  webUrl?: string;
  parentReference?: {
    driveId?: string;
    id?: string;
    path?: string;
  };
  "@microsoft.graph.downloadUrl"?: string;
}

function toShareId(shareUrl: string): string {
  const base64 = Buffer.from(shareUrl, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `u!${base64}`;
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

    const url = `https://login.microsoftonline.com/${encodeURIComponent(env.graphTenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: env.graphClientId,
      client_secret: env.graphClientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default"
    });

    const response = await axios.post<GraphTokenResponse>(url, body, {
      timeout: 30_000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const token = response.data.access_token;
    const expiresAt = now + Math.max(response.data.expires_in - 60, 60) * 1000;
    this.tokenCache = { token, expiresAt };
    return token;
  }

  async resolveShareUrl(shareUrl: string): Promise<{
    driveItemId: string;
    name: string;
    downloadUrl: string;
  }> {
    const accessToken = await this.getAccessToken();
    const shareId = toShareId(shareUrl);

    logger.info({ shareId }, "Resolving SharePoint share link");

    const response = await this.http.get<SharePointDriveItemResponse>(`/shares/${shareId}/driveItem`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params: {
        $select: "id,name,@microsoft.graph.downloadUrl,webUrl"
      }
    });

    const driveItem = response.data;
    const downloadUrl = driveItem["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      throw new Error("Unable to resolve @microsoft.graph.downloadUrl from SharePoint link");
    }

    return {
      driveItemId: driveItem.id,
      name: driveItem.name ?? "archive.zip",
      downloadUrl
    };
  }
}
