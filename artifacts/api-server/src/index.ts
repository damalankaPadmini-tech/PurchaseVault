import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import mongoose from "mongoose";
import { connectMongo, isMongoReady } from "./lib/mongo.js";

const rawPort = process.env.PORT;
if (!rawPort) throw new Error("PORT environment variable is required.");

const port = Number(rawPort);
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port.");
}

let shuttingDown = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

async function connectInBackground() {
  let retryDelayMs = 5_000;
  while (!shuttingDown && !isMongoReady()) {
    try {
      await connectMongo();
      return;
    } catch {
      if (shuttingDown) return;
      await new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, retryDelayMs);
        retryTimer.unref();
      });
      retryTimer = undefined;
      retryDelayMs = Math.min(retryDelayMs * 2, 60_000);
    }
  }
}

function startServer() {
  const server = app.listen(port, (error) => {
    if (error) {
      logger.error({ errorName: error.name }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    void connectInBackground();
  });

  server.on("error", (error) => {
    logger.error({ errorName: error.name }, "API listener failed");
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    shuttingDown = true;
    if (retryTimer) clearTimeout(retryTimer);
    logger.info({ signal }, "Shutting down API server");
    server.close(async (error) => {
      if (error) logger.error({ errorName: error.name }, "Server close failed");
      await mongoose.disconnect();
      process.exit(error ? 1 : 0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer();
