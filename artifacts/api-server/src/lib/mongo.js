import mongoose from "mongoose";
import { logger } from "./logger.js";

mongoose.set("bufferCommands", false);
let databaseInitialized = false;

export function isMongoReady() {
  return databaseInitialized && mongoose.connection.readyState === 1;
}

function inspectMongoFailure(error) {
  const pending = [error];
  const seen = new Set();
  const names = new Set();
  const codes = new Set();
  const messages = [];

  while (pending.length && seen.size < 40) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (typeof current.name === "string") names.add(current.name);
    if (typeof current.code === "string" || typeof current.code === "number") {
      codes.add(String(current.code));
    }
    if (typeof current.codeName === "string") names.add(current.codeName);
    if (typeof current.message === "string") messages.push(current.message.toLowerCase());

    for (const key of ["cause", "reason", "error"]) {
      if (current[key] && typeof current[key] === "object") {
        pending.push(current[key]);
      }
    }
    if (current.reason?.servers instanceof Map) {
      pending.push(...current.reason.servers.values());
    }
    if (Array.isArray(current.errors)) pending.push(...current.errors);
  }

  return {
    names: [...names].filter((value) => /^[A-Za-z0-9_]{1,64}$/.test(value)),
    codes: [...codes].filter((value) => /^[A-Za-z0-9_]{1,32}$/.test(value)),
    message: messages.join(" "),
  };
}

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured in Replit Secrets.");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured as a strong Replit Secret.");
  }

  databaseInitialized = false;
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 12_000,
      autoIndex: process.env.NODE_ENV !== "production",
    });
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.createIndexes()),
    );
    databaseInitialized = true;
    logger.info({ database: mongoose.connection.name }, "MongoDB connection ready");
  } catch (error) {
    databaseInitialized = false;
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
    const diagnostic = inspectMongoFailure(error);
    const category = diagnostic.codes.some((code) => ["18", "8000"].includes(code)) ||
      /authentication failed|bad auth|auth failed/.test(diagnostic.message)
      ? "authentication"
      : diagnostic.codes.some((code) =>
          ["ENOTFOUND", "ESERVFAIL", "EBADNAME", "ENODATA"].includes(code),
        ) || diagnostic.message.includes("querysrv")
        ? "dns"
        : diagnostic.codes.some((code) =>
            [
              "ECONNREFUSED",
              "ETIMEDOUT",
              "EHOSTUNREACH",
              "ENETUNREACH",
              "ECONNRESET",
              "ESOCKETTIMEDOUT",
            ].includes(code),
          ) || diagnostic.names.includes("MongooseServerSelectionError")
          ? "network_or_allowlist"
          : diagnostic.message.includes("index")
            ? "index_initialization"
            : "unknown";
    logger.error(
      {
        errorName:
          typeof error === "object" && error && "name" in error
            ? String(error.name)
            : "UnknownError",
        nestedErrorNames: diagnostic.names,
        nestedErrorCodes: diagnostic.codes,
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
