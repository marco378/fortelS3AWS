import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "fortel-zip-worker",
    env: env.nodeEnv
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
