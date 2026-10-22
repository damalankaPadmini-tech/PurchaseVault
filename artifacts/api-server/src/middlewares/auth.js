import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { unauthorized } from "../lib/httpError.js";

const COOKIE_NAME = "pv_auth";
const ISSUER = "purchasevault";
const AUDIENCE = "purchasevault-app";

export function createSessionCookie(res, userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured as a strong Replit Secret.");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "1d";
  const token = jwt.sign({ sub: String(userId) }, secret, {
    expiresIn,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const decoded = jwt.decode(token);
  const maxAge = decoded?.exp ? Math.max(0, decoded.exp * 1000 - Date.now()) : undefined;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    ...(maxAge ? { maxAge } : {}),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
  });
}

export function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(unauthorized());

  const secret = process.env.JWT_SECRET;
  if (!secret) return next(unauthorized("Your session is no longer valid. Sign in again."));

  try {
    const payload = jwt.verify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    if (
      typeof payload !== "object" ||
      typeof payload.sub !== "string" ||
      !mongoose.isValidObjectId(payload.sub)
    ) {
      return next(unauthorized("Your session is no longer valid. Sign in again."));
    }
    req.auth = { userId: payload.sub };
    return next();
  } catch {
    return next(unauthorized("Your session has expired. Sign in again."));
  }
}
