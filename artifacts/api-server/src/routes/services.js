import { Router } from "express";
import mongoose from "mongoose";
import {
  CreatePurchaseServiceRecordBody,
  CreatePurchaseServiceRecordParams,
  CreatePurchaseServiceRecordResponse,
  DeletePurchaseServiceRecordParams,
  GetPurchaseServiceRecordParams,
  GetPurchaseServiceRecordResponse,
  GetPurchaseServiceRecordsParams,
  GetPurchaseServiceRecordsResponse,
  UpdatePurchaseServiceRecordBody,
  UpdatePurchaseServiceRecordParams,
  UpdatePurchaseServiceRecordResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { DocumentRecord } from "../models/Document.js";
import { Purchase } from "../models/Purchase.js";
import { ServiceRecord } from "../models/ServiceRecord.js";
import { parseDateOnly, serviceRecordToApi } from "../lib/dateUtils.js";
import { badRequest, notFound, parseInput } from "../lib/httpError.js";

const router = Router();
router.use(requireAuth);

async function assertReceiptBelongsToPurchase(receiptDocumentId, purchaseId, userId) {
  if (receiptDocumentId == null) return null;
  if (!mongoose.isValidObjectId(receiptDocumentId)) {
    throw badRequest("Receipt document id is invalid.");
  }
  const document = await DocumentRecord.exists({
    _id: receiptDocumentId,
    purchaseId,
    userId,
  });
  if (!document) {
    throw badRequest("Receipt must belong to this purchase and account.");
  }
  return receiptDocumentId;
}

async function findOwnedPurchase(purchaseId, userId) {
  const purchase = await Purchase.findOne({ _id: purchaseId, userId }).select("_id");
  if (!purchase) throw notFound("Purchase not found.");
  return purchase;
}

function serviceValues(input) {
  return {
    serviceDate: parseDateOnly(input.serviceDate, "serviceDate"),
    serviceCenter: input.serviceCenter.trim(),
    description: input.description.trim(),
    expense: Number(input.expense),
    currency: (input.currency || "USD").toUpperCase(),
    status: input.status || "reported",
    receiptDocumentId: input.receiptDocumentId ?? null,
  };
}

router.get("/purchases/:purchaseId/services", async (req, res) => {
  const params = parseInput(GetPurchaseServiceRecordsParams, req.params);
  const purchase = await findOwnedPurchase(params.purchaseId, req.auth.userId);
  const records = await ServiceRecord.find({
    purchaseId: purchase._id,
    userId: req.auth.userId,
  }).sort({ serviceDate: -1, _id: -1 });
  res.json(
    GetPurchaseServiceRecordsResponse.parse(records.map(serviceRecordToApi)),
  );
});

router.post("/purchases/:purchaseId/services", async (req, res) => {
  const params = parseInput(CreatePurchaseServiceRecordParams, req.params);
  const input = parseInput(CreatePurchaseServiceRecordBody, req.body);
  const purchase = await findOwnedPurchase(params.purchaseId, req.auth.userId);
  const values = serviceValues(input);
  values.receiptDocumentId = await assertReceiptBelongsToPurchase(
    values.receiptDocumentId,
    purchase._id,
    req.auth.userId,
  );
  const record = await ServiceRecord.create({
    ...values,
    purchaseId: purchase._id,
    userId: req.auth.userId,
  });
  res
    .status(201)
    .json(CreatePurchaseServiceRecordResponse.parse(serviceRecordToApi(record)));
});

router.get(
  "/purchases/:purchaseId/services/:serviceId",
  async (req, res) => {
    const params = parseInput(GetPurchaseServiceRecordParams, req.params);
    await findOwnedPurchase(params.purchaseId, req.auth.userId);
    const record = await ServiceRecord.findOne({
      _id: params.serviceId,
      purchaseId: params.purchaseId,
      userId: req.auth.userId,
    });
    if (!record) throw notFound("Service record not found.");
    res.json(GetPurchaseServiceRecordResponse.parse(serviceRecordToApi(record)));
  },
);

router.put(
  "/purchases/:purchaseId/services/:serviceId",
  async (req, res) => {
    const params = parseInput(UpdatePurchaseServiceRecordParams, req.params);
    const input = parseInput(UpdatePurchaseServiceRecordBody, req.body);
    const purchase = await findOwnedPurchase(params.purchaseId, req.auth.userId);
    const values = serviceValues(input);
    values.receiptDocumentId = await assertReceiptBelongsToPurchase(
      values.receiptDocumentId,
      purchase._id,
      req.auth.userId,
    );
    const record = await ServiceRecord.findOneAndUpdate(
      {
        _id: params.serviceId,
        purchaseId: params.purchaseId,
        userId: req.auth.userId,
      },
      values,
      { new: true, runValidators: true },
    );
    if (!record) throw notFound("Service record not found.");
    res.json(UpdatePurchaseServiceRecordResponse.parse(serviceRecordToApi(record)));
  },
);

router.delete(
  "/purchases/:purchaseId/services/:serviceId",
  async (req, res) => {
    const params = parseInput(DeletePurchaseServiceRecordParams, req.params);
    await findOwnedPurchase(params.purchaseId, req.auth.userId);
    const record = await ServiceRecord.findOneAndDelete({
      _id: params.serviceId,
      purchaseId: params.purchaseId,
      userId: req.auth.userId,
    });
    if (!record) throw notFound("Service record not found.");
    res.sendStatus(204);
  },
);

export default router;
