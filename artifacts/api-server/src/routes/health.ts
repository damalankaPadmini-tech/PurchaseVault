import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isMongoReady } from "../lib/mongo.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const connected = isMongoReady();
  const data = HealthCheckResponse.parse({
    status: connected ? "ok" : "unavailable",
  });
  res.status(connected ? 200 : 503).json(data);
});

export default router;
