import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase", required: true },
    documentType: {
      type: String,
      enum: ["invoice", "warranty_card", "receipt", "service_receipt", "other"],
      required: true,
    },
    originalFilename: { type: String, required: true, trim: true, maxlength: 255 },
    storageKey: { type: String, default: null, select: false, maxlength: 512 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

documentSchema.index({ userId: 1, purchaseId: 1, uploadedAt: -1 });

export const DocumentRecord =
  mongoose.models.DocumentRecord ?? mongoose.model("DocumentRecord", documentSchema);
