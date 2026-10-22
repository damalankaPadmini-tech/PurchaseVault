import { Router } from "express";
import mongoose from "mongoose";
import {
  CreatePurchaseDocumentBody,
  CreatePurchaseDocumentParams,
  CreatePurchaseDocumentResponse,
  DeleteDocumentParams,
  GetDocumentParams,
  GetDocumentResponse,
  GetPurchaseDocumentsParams,
  GetPurchaseDocumentsResponse,
  UpdateDocumentBody,
  UpdateDocumentParams,
  UpdateDocumentResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { DocumentRecord } from "../models/Document.js";
import { Purchase } from "../models/Purchase.js";
import { ServiceRecord } from "../models/ServiceRecord.js";
import { documentToApi } from "../lib/dateUtils.js";
import { badRequest, notFound, parseInput } from "../lib/httpError.js";

const router = Router();
router.use(requireAuth);

function validateStorageKey(storageKey) {
  if (
    storageKey != null &&
    (storageKey.startsWith("/") ||
      storageKey.includes("\\") ||
      storageKey.includes("..") ||
      !/^[a-z\d/_-]+$/i.test(storageKey))
  ) {
    throw badRequest("Storage key is not a valid opaque storage reference.");
  }
}

router.get("/purchases/:purchaseId/documents", async (req, res) => {
  const params = parseInput(GetPurchaseDocumentsParams, req.params);
  const purchase = await Purchase.findOne({
    _id: params.purchaseId,
    userId: req.auth.userId,
  }).select("_id");
  if (!purchase) throw notFound("Purchase not found.");

  const documents = await DocumentRecord.find({
    purchaseId: purchase._id,
    userId: req.auth.userId,
  }).sort({ uploadedAt: -1 });
  res.json(
    GetPurchaseDocumentsResponse.parse(documents.map(documentToApi)),
  );
});

router.post("/purchases/:purchaseId/documents", async (req, res) => {
  const params = parseInput(CreatePurchaseDocumentParams, req.params);
  const input = parseInput(CreatePurchaseDocumentBody, req.body);
  const purchase = await Purchase.findOne({
    _id: params.purchaseId,
    userId: req.auth.userId,
  }).select("_id");
  if (!purchase) throw notFound("Purchase not found.");
  validateStorageKey(input.storageKey);

  const document = await DocumentRecord.create({
    userId: req.auth.userId,
    purchaseId: purchase._id,
    documentType: input.documentType,
    originalFilename: input.originalFilename.trim(),
    storageKey: input.storageKey ?? null,
  });
  res
    .status(201)
    .json(CreatePurchaseDocumentResponse.parse(documentToApi(document)));
});

router.get("/documents/:documentId", async (req, res) => {
  const params = parseInput(GetDocumentParams, req.params);
  const document = await DocumentRecord.findOne({
    _id: params.documentId,
    userId: req.auth.userId,
  });
  if (!document) throw notFound("Document not found.");
  res.json(GetDocumentResponse.parse(documentToApi(document)));
});

router.put("/documents/:documentId", async (req, res) => {
  const params = parseInput(UpdateDocumentParams, req.params);
  const input = parseInput(UpdateDocumentBody, req.body);
  if (input.originalFilename !== undefined && !input.originalFilename.trim()) {
    throw badRequest("Document filename cannot be blank.");
  }
  const update = {
    ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
    ...(input.originalFilename !== undefined
      ? { originalFilename: input.originalFilename.trim() }
      : {}),
  };
  const document = await DocumentRecord.findOneAndUpdate(
    { _id: params.documentId, userId: req.auth.userId },
    update,
    { new: true, runValidators: true },
  );
  if (!document) throw notFound("Document not found.");
  res.json(UpdateDocumentResponse.parse(documentToApi(document)));
});

router.delete("/documents/:documentId", async (req, res) => {
  const params = parseInput(DeleteDocumentParams, req.params);
  const document = await DocumentRecord.findOneAndDelete({
    _id: params.documentId,
    userId: req.auth.userId,
  });
  if (!document) throw notFound("Document not found.");
  await ServiceRecord.updateMany(
    { receiptDocumentId: document._id, userId: req.auth.userId },
    { $set: { receiptDocumentId: null } },
  );
  res.sendStatus(204);
});

export default router;
