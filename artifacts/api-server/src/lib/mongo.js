import mongoose from "mongoose";
import { logger } from "./logger.js";

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured in Replit Secrets.");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured as a strong Replit Secret.");
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 12_000,
      autoIndex: process.env.NODE_ENV !== "production",
    });
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.createIndexes()),
    );
    logger.info({ database: mongoose.connection.name }, "MongoDB connection ready");
  } catch (error) {
    const safeMessage =
      error instanceof Error ? error.message.toLowerCase() : "";
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : undefined;
    const category = safeMessage.includes("authentication failed")
      ? "authentication"
      : safeMessage.includes("querysrv") || errorCode === "ENOTFOUND"
        ? "dns"
        : errorCode === "ECONNREFUSED" || safeMessage.includes("server selection")
          ? "network_or_allowlist"
          : safeMessage.includes("index")
            ? "index_initialization"
            : "unknown";
    logger.error(
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode,
        category,
      },
      "MongoDB initialization failed",
    );
    throw new Error(
      "Could not connect to MongoDB. Check the Atlas URI and network access settings.",
    );
  }
}

export { mongoose };
