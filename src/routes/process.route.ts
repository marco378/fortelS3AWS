import { Router } from "express";
import { ProcessController } from "../controllers/process.controller";

export function createProcessRouter(controller: ProcessController): Router {
  const router = Router();
  router.post("/process", controller.handleProcess);
  return router;
}
