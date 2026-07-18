import { Router } from "express";

export function createHealthRouter(): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "fortel-zip-worker",
      uptimeSeconds: Math.round(process.uptime())
    });
  });
  return router;
}
