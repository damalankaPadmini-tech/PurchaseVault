import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/errorHandler.js";
import { isMongoReady } from "./lib/mongo.js";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet());

const configuredOrigins = new Set(
  (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use((req, res, next) => {
  const origin = req.get("Origin");
  const requestHost = (req.get("x-forwarded-host") ?? req.get("host") ?? "")
    .split(",")[0]
    .trim();
  let sameHost = false;
  try {
    sameHost = origin ? new URL(origin).host === requestHost : false;
  } catch {
    sameHost = false;
  }
  const allowed = !origin || sameHost || configuredOrigins.has(origin);
  cors({ credentials: true, origin: allowed })(req, res, next);
});
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", (req, res, next) => {
  if (req.path === "/healthz" || (req.path === "/auth/logout" && req.method === "POST")) {
    next();
    return;
  }

  if (!isMongoReady()) {
    res.status(503).json({
      error: "DATABASE_UNAVAILABLE",
      message: "PurchaseVault is reconnecting to its database. Please try again shortly.",
    });
    return;
  }

  next();
});

app.use("/api", router);
app.use((req, res) => {
  res.status(404).json(
    {
      error: "NOT_FOUND",
      message: `No API route matches ${req.method} ${req.path}.`,
    },
  );
});
app.use(errorHandler);

export default app;
