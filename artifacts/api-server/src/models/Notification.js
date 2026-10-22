import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase", required: true },
    type: {
      type: String,
      enum: ["warranty_expiring", "return_deadline_approaching", "return_deadline_passed"],
      required: true,
    },
    message: { type: String, required: true, maxlength: 300 },
    scheduledFor: { type: Date, required: true },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

notificationSchema.index({ userId: 1, scheduledFor: 1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export const Notification =
  mongoose.models.Notification ?? mongoose.model("Notification", notificationSchema);
