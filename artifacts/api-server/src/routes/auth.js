import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import {
  GetCurrentUserResponse,
  LoginAuthBody,
  LoginAuthResponse,
  RegisterAuthBody,
  RegisterAuthResponse,
} from "@workspace/api-zod";
import { User } from "../models/User.js";
import {
  clearSessionCookie,
  createSessionCookie,
  requireAuth,
} from "../middlewares/auth.js";
import {
  conflict,
  notFound,
  parseInput,
  unauthorized,
} from "../lib/httpError.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", message: "Too many sign-in attempts. Try again later." },
});

function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/register", authLimiter, async (req, res) => {
  const input = parseInput(RegisterAuthBody, req.body);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) {
    const error = new Error("Name is required.");
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  if (await User.exists({ email })) {
    throw conflict("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({ name, email, passwordHash });
  createSessionCookie(res, user._id);
  res.status(201).json(RegisterAuthResponse.parse({ user: toPublicUser(user) }));
});

router.post("/auth/login", authLimiter, async (req, res) => {
  const input = parseInput(LoginAuthBody, req.body);
  const email = input.email.trim().toLowerCase();
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw unauthorized("Email or password is incorrect.");
  }
  createSessionCookie(res, user._id);
  res.json(LoginAuthResponse.parse({ user: toPublicUser(user) }));
});

router.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.auth.userId);
  if (!user) {
    clearSessionCookie(res);
    throw notFound("This account could not be found.");
  }
  res.json(GetCurrentUserResponse.parse({ user: toPublicUser(user) }));
});

export default router;
