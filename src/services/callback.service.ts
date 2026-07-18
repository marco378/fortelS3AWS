import axios, { AxiosInstance } from "axios";
import { env } from "../config/env";
import { logger } from "../config/logger";

export class CallbackService {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      timeout: 30_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
  }

  async sendCallback(
    callbackUrl: string,
    payload: unknown,
    callbackToken?: string
  ): Promise<void> {
    const attempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        logger.info({ callbackUrl, attempt }, "Sending completion callback");
        await this.http.post(callbackUrl, payload, {
          headers: {
            "Content-Type": "application/json",
            "X-N8N-Callback-Secret": env.n8nCallbackSecret,
            ...(callbackToken ? { "X-N8N-Callback-Token": callbackToken } : {})
          }
        });
        return;
      } catch (error) {
        lastError = error;
        const delayMs = 1000 * attempt * attempt;
        logger.warn({ callbackUrl, attempt, delayMs, error }, "Callback attempt failed");
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Callback delivery failed");
  }
}
