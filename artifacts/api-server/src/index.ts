import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import mongoose from "mongoose";
import { connectMongo } from "./lib/mongo.js";

const rawPort = process.env.PORT;
if (!rawPort) throw new Error("PORT environment variable is required.");

const port = Number(rawPort);
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port.");
}

async function startServer() {
  await connectMongo();
  const server = app.listen(port, (error) => {
    if (error) {
      logger.error({ errorName: error.name }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  const shutdown = (signal: string) => {
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

startServer().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "StartupError";
  const message =
    error instanceof Error && error.message.includes("MONGODB_URI")
      ? error.message
      : "API server startup failed. Check MongoDB connection and server configuration.";
  logger.error({ errorName: name, message }, "API server failed to start");
  process.exit(1);
});
