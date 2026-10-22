import mongoose from "mongoose";

const serviceRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase", required: true },
    serviceDate: { type: Date, required: true },
    serviceCenter: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    expense: { type: Number, required: true, min: 0, max: 100_000_000 },
    currency: { type: String, required: true, uppercase: true, default: "USD", minlength: 3, maxlength: 3 },
    status: {
      type: String,
      enum: ["reported", "scheduled", "completed", "cancelled"],
      required: true,
      default: "reported",
    },
    receiptDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentRecord", default: null },
  },
  { timestamps: true, versionKey: false },
);

serviceRecordSchema.index({ userId: 1, purchaseId: 1, serviceDate: -1 });

export const ServiceRecord =
  mongoose.models.ServiceRecord ?? mongoose.model("ServiceRecord", serviceRecordSchema);
