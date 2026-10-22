import { Router } from "express";
import mongoose from "mongoose";
import {
  CreatePurchaseBody,
  CreatePurchaseResponse,
  DeletePurchaseParams,
  GetDashboardSummaryResponse,
  GetPurchaseClaimSummaryParams,
  GetPurchaseClaimSummaryResponse,
  GetPurchaseParams,
  GetPurchaseResponse,
  GetPurchasesQueryParams,
  GetPurchasesResponse,
  UpdatePurchaseBody,
  UpdatePurchaseParams,
  UpdatePurchaseResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { DocumentRecord } from "../models/Document.js";
import { Notification } from "../models/Notification.js";
import { Purchase } from "../models/Purchase.js";
import { ServiceRecord } from "../models/ServiceRecord.js";
import {
  addCalendarMonths,
  dateOnlyString,
  getWarrantyStatus,
  parseDateOnly,
  purchaseToApi,
  serviceRecordToApi,
  documentToApi,
  todayDateOnly,
} from "../lib/dateUtils.js";
import { badRequest, notFound, parseInput } from "../lib/httpError.js";
import { getUpcomingDeadlines } from "../lib/reminders.js";

const router = Router();
router.use(requireAuth);

const sortOptions = {
  purchaseDateDesc: { purchaseDate: -1, _id: -1 },
  purchaseDateAsc: { purchaseDate: 1, _id: 1 },
  priceAsc: { price: 1, _id: 1 },
  priceDesc: { price: -1, _id: -1 },
  nameAsc: { productName: 1, _id: 1 },
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makePurchaseValues(input) {
  const purchaseDate = parseDateOnly(input.purchaseDate, "purchaseDate");
  const warrantyMonths = Number(input.warrantyMonths);
  if (!Number.isInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 120) {
    throw badRequest("Warranty duration must be a whole number from 0 to 120 months.");
  }
  if (purchaseDate.getTime() > parseDateOnly(todayDateOnly()).getTime()) {
    throw badRequest("Purchase date cannot be in the future.");
  }

  const returnDeadline = input.returnDeadline
    ? parseDateOnly(input.returnDeadline, "returnDeadline")
    : null;
  if (returnDeadline && returnDeadline < purchaseDate) {
    throw badRequest("Return deadline cannot come before the purchase date.");
  }

  const warrantyExpiryDate = addCalendarMonths(input.purchaseDate, warrantyMonths);
  return {
    productName: input.productName.trim(),
    brand: input.brand.trim(),
    category: input.category.trim(),
    purchaseDate,
    price: Number(input.price),
    currency: (input.currency || "USD").toUpperCase(),
    warrantyDurationMonths: warrantyMonths,
    warrantyExpiryDate,
    returnDeadline,
    serialNumber: (input.serialNumber || "").trim(),
    invoiceNumber: input.invoiceNumber?.trim() || null,
    sellerName: input.sellerName?.trim() || null,
    notes: input.notes?.trim() || null,
    status: getWarrantyStatus(dateOnlyString(warrantyExpiryDate)).status,
  };
}

function ownerFilter(req) {
  return { userId: req.auth.userId };
}

function validateObjectId(id, field) {
  if (!mongoose.isValidObjectId(id)) {
    throw badRequest(`${field} is not a valid record id.`);
  }
}

router.get("/dashboard/summary", async (req, res) => {
  const userId = req.auth.userId;
  const today = parseDateOnly(todayDateOnly());
  const [totalPurchases, activeWarranties, expiringSoon, upcoming] = await Promise.all([
    Purchase.countDocuments({ userId }),
    Purchase.countDocuments({ userId, warrantyExpiryDate: { $gt: today } }),
    Purchase.countDocuments({
      userId,
      warrantyExpiryDate: {
        $gt: today,
        $lte: new Date(today.getTime() + 30 * 86_400_000),
      },
    }),
    getUpcomingDeadlines(userId),
  ]);
  const returnDeadlines = upcoming.filter(
    (item) => item.type === "return_deadline_approaching" && item.status === "closing",
  ).length;

  res.json(
    GetDashboardSummaryResponse.parse({
      totalPurchases,
      activeWarranties,
      expiringSoon,
      returnDeadlines,
      upcoming,
    }),
  );
});

router.get("/purchases", async (req, res) => {
  const params = parseInput(GetPurchasesQueryParams, req.query);
  const filter = ownerFilter(req);
  if (params.category) filter.category = params.category;
  if (params.search) {
    const escaped = new RegExp(escapeRegex(params.search), "i");
    filter.$or = [
      { productName: escaped },
      { brand: escaped },
      { category: escaped },
      { serialNumber: escaped },
    ];
  }

  if (params.warrantyStatus) {
    const today = parseDateOnly(todayDateOnly());
    const horizon = new Date(today.getTime() + 30 * 86_400_000);
    if (params.warrantyStatus === "expired") {
      filter.warrantyExpiryDate = { $lte: today };
    } else if (params.warrantyStatus === "expiringSoon") {
      filter.warrantyExpiryDate = { $gt: today, $lte: horizon };
    } else {
      filter.warrantyExpiryDate = { $gt: horizon };
    }
  }

  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const [records, totalItems] = await Promise.all([
    Purchase.find(filter)
      .sort(sortOptions[params.sort ?? "purchaseDateDesc"])
      .skip((page - 1) * limit)
      .limit(limit),
    Purchase.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(totalItems / limit);
  const response = {
    items: records.map(purchaseToApi),
    pagination: { page, limit, totalItems, totalPages },
  };
  res.json(GetPurchasesResponse.parse(response));
});

router.post("/purchases", async (req, res) => {
  const input = parseInput(CreatePurchaseBody, req.body);
  const purchase = await Purchase.create({
    ...makePurchaseValues(input),
    userId: req.auth.userId,
  });
  res.status(201).json(CreatePurchaseResponse.parse(purchaseToApi(purchase)));
});

router.get("/purchases/:purchaseId", async (req, res) => {
  const params = parseInput(GetPurchaseParams, req.params);
  const purchase = await Purchase.findOne({ _id: params.purchaseId, ...ownerFilter(req) });
  if (!purchase) throw notFound("Purchase not found.");
  res.json(GetPurchaseResponse.parse(purchaseToApi(purchase)));
});

router.put("/purchases/:purchaseId", async (req, res) => {
  const params = parseInput(UpdatePurchaseParams, req.params);
  const input = parseInput(UpdatePurchaseBody, req.body);
  const purchase = await Purchase.findOneAndUpdate(
    { _id: params.purchaseId, ...ownerFilter(req) },
    makePurchaseValues(input),
    { new: true, runValidators: true },
  );
  if (!purchase) throw notFound("Purchase not found.");
  res.json(UpdatePurchaseResponse.parse(purchaseToApi(purchase)));
});

router.delete("/purchases/:purchaseId", async (req, res) => {
  const params = parseInput(DeletePurchaseParams, req.params);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const purchase = await Purchase.findOne({
        _id: params.purchaseId,
        ...ownerFilter(req),
      }).session(session);
      if (!purchase) throw notFound("Purchase not found.");
      const filter = { purchaseId: purchase._id, userId: req.auth.userId };
      await Promise.all([
        DocumentRecord.deleteMany(filter, { session }),
        ServiceRecord.deleteMany(filter, { session }),
        Notification.deleteMany(filter, { session }),
      ]);
      await Purchase.deleteOne({ _id: purchase._id, userId: req.auth.userId }, { session });
    });
  } finally {
    await session.endSession();
  }
  res.sendStatus(204);
});

router.get("/purchases/:purchaseId/claim-summary", async (req, res) => {
  const params = parseInput(GetPurchaseClaimSummaryParams, req.params);
  const purchase = await Purchase.findOne({
    _id: params.purchaseId,
    ...ownerFilter(req),
  });
  if (!purchase) throw notFound("Purchase not found.");

  const [documents, serviceRecords] = await Promise.all([
    DocumentRecord.find({ purchaseId: purchase._id, userId: req.auth.userId }).sort({ uploadedAt: -1 }),
    ServiceRecord.find({ purchaseId: purchase._id, userId: req.auth.userId }).sort({ serviceDate: -1 }),
  ]);
  res.json(
    GetPurchaseClaimSummaryResponse.parse({
      purchase: purchaseToApi(purchase),
      documents: documents.map(documentToApi),
      serviceRecords: serviceRecords.map(serviceRecordToApi),
    }),
  );
});

export default router;
