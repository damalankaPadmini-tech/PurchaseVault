import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { mongoose } from "../lib/mongo.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  const data = HealthCheckResponse.parse({
    status: connected ? "ok" : "unavailable",
  });
  res.status(connected ? 200 : 503).json(data);
});

export default router;
