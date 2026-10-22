import mongoose from "mongoose";

const purchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productName: { type: String, required: true, trim: true, maxlength: 160 },
    brand: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    purchaseDate: { type: Date, required: true },
    price: { type: Number, required: true, min: 0, max: 100_000_000 },
    currency: { type: String, required: true, uppercase: true, default: "USD", minlength: 3, maxlength: 3 },
    warrantyDurationMonths: { type: Number, required: true, min: 0, max: 120, validate: Number.isInteger },
    warrantyExpiryDate: { type: Date, required: true },
    returnDeadline: { type: Date, default: null },
    serialNumber: { type: String, default: "", trim: true, maxlength: 120 },
    invoiceNumber: { type: String, default: null, trim: true, maxlength: 120 },
    sellerName: { type: String, default: null, trim: true, maxlength: 160 },
    notes: { type: String, default: null, trim: true, maxlength: 2000 },
    status: { type: String, enum: ["active", "expiringSoon", "expired"], required: true, default: "active" },
  },
  { timestamps: true, versionKey: false },
);

purchaseSchema.index({ userId: 1, purchaseDate: -1 });
purchaseSchema.index({ userId: 1, category: 1 });
purchaseSchema.index({ userId: 1, warrantyExpiryDate: 1 });

export const Purchase = mongoose.models.Purchase ?? mongoose.model("Purchase", purchaseSchema);
