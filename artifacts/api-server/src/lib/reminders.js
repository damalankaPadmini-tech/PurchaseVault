import { Notification } from "../models/Notification.js";
import { Purchase } from "../models/Purchase.js";
import { dateOnlyString, daysBetween, todayDateOnly } from "./dateUtils.js";

const DAY_MS = 86_400_000;

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getUpcomingDeadlines(userId) {
  const today = todayDateOnly();
  const horizon = shiftDate(today, 30);
  const returnStart = shiftDate(today, -30);

  const [warranties, returns] = await Promise.all([
    Purchase.find({
      userId,
      warrantyExpiryDate: {
        $gt: new Date(`${today}T00:00:00.000Z`),
        $lte: new Date(`${horizon}T00:00:00.000Z`),
      },
    })
      .select("_id productName brand warrantyExpiryDate")
      .lean(),
    Purchase.find({
      userId,
      returnDeadline: {
        $gte: new Date(`${returnStart}T00:00:00.000Z`),
        $lte: new Date(`${horizon}T00:00:00.000Z`),
      },
    })
      .select("_id productName brand returnDeadline")
      .lean(),
  ]);

  const deadlines = warranties.map((purchase) => {
    const deadlineDate = dateOnlyString(purchase.warrantyExpiryDate);
    return {
      purchaseId: String(purchase._id),
      productName: purchase.productName,
      brand: purchase.brand,
      type: "warranty_expiring",
      deadlineDate,
      daysRemaining: daysBetween(today, deadlineDate),
      status: "upcoming",
    };
  });

  for (const purchase of returns) {
    const deadlineDate = dateOnlyString(purchase.returnDeadline);
    const daysRemaining = daysBetween(today, deadlineDate);
    deadlines.push({
      purchaseId: String(purchase._id),
      productName: purchase.productName,
      brand: purchase.brand,
      type: daysRemaining < 0
        ? "return_deadline_passed"
        : "return_deadline_approaching",
      deadlineDate,
      daysRemaining,
      status: daysRemaining < 0 ? "passed" : daysRemaining <= 7 ? "closing" : "upcoming",
    });
  }

  return deadlines.sort((left, right) =>
    left.deadlineDate.localeCompare(right.deadlineDate),
  );
}

export async function ensureUpcomingNotifications(userId, deadlines) {
  const actionable = deadlines.filter(
    (item) =>
      item.type === "warranty_expiring" ||
      (item.type === "return_deadline_approaching" && item.status === "closing"),
  );

  await Promise.all(
    actionable.map(async (item) => {
      const dedupeKey = `${item.type}:${item.purchaseId}:${item.deadlineDate}`;
      const message =
        item.type === "warranty_expiring"
          ? `The warranty for ${item.productName} expires on ${item.deadlineDate}.`
          : `The return window for ${item.productName} closes on ${item.deadlineDate}.`;
      try {
        await Notification.updateOne(
          { userId, dedupeKey },
          {
            $setOnInsert: {
              userId,
              purchaseId: item.purchaseId,
              type: item.type,
              message,
              scheduledFor: new Date(`${item.deadlineDate}T00:00:00.000Z`),
              dedupeKey,
              readAt: null,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        // A concurrent request may win the unique-index insert; that is already the desired state.
        if (error?.code !== 11000) throw error;
      }
    }),
  );
}

export function isReturnDeadlineClosing(value, today = todayDateOnly()) {
  if (!value) return false;
  const days = daysBetween(today, value);
  return days >= 0 && days <= 7;
}

export function addDaysToDate(value, days) {
  return new Date(`${shiftDate(value, days)}T00:00:00.000Z`);
}

export function startOfDay(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

export const DAY_IN_MS = DAY_MS;
