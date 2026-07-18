import { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(
    {
      path: req.path,
      method: req.method,
      err
    },
    "Unhandled request error"
  );

  res.status(500).json({
    status: "error",
    message: err instanceof Error ? err.message : "Internal server error"
  });
}
