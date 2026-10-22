import { Router } from "express";
import {
  GetNotificationsResponse,
  GetUpcomingDeadlinesResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { Notification } from "../models/Notification.js";
import { notificationToApi } from "../lib/dateUtils.js";
import { notFound, parseInput } from "../lib/httpError.js";
import {
  ensureUpcomingNotifications,
  getUpcomingDeadlines,
} from "../lib/reminders.js";

const router = Router();
router.use(requireAuth);

router.get("/notifications", async (req, res) => {
  const userId = req.auth.userId;
  const deadlines = await getUpcomingDeadlines(userId);
  await ensureUpcomingNotifications(userId, deadlines);
  const notifications = await Notification.find({ userId })
    .sort({ readAt: 1, scheduledFor: 1, createdAt: -1 })
    .limit(100);
  res.json(
    GetNotificationsResponse.parse(notifications.map(notificationToApi)),
  );
});

router.get("/notifications/upcoming", async (req, res) => {
  const deadlines = await getUpcomingDeadlines(req.auth.userId);
  res.json(GetUpcomingDeadlinesResponse.parse(deadlines));
});

router.patch("/notifications/:notificationId/read", async (req, res) => {
  const params = parseInput(MarkNotificationReadParams, req.params);
  const notification = await Notification.findOneAndUpdate(
    { _id: params.notificationId, userId: req.auth.userId },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (!notification) throw notFound("Notification not found.");
  res.json(
    MarkNotificationReadResponse.parse(notificationToApi(notification)),
  );
});

export default router;
