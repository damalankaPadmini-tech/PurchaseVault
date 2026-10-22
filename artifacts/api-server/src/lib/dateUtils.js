const DAY_MS = 86_400_000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function invalidDate(field) {
  const error = new Error(`${field} must be a valid calendar date in YYYY-MM-DD format.`);
  error.status = 400;
  error.code = "INVALID_DATE";
  return error;
}

export function parseDateOnly(value, field = "date") {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalidDate(field);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) {
    throw invalidDate(field);
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw invalidDate(field);
  }
  return parsed;
}

export function dateOnlyString(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

export function addCalendarMonths(value, months) {
  const date = parseDateOnly(value, "purchaseDate");
  const monthIndex = date.getUTCMonth() + Number(months);
  const firstOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), monthIndex, 1));
  const targetYear = firstOfTargetMonth.getUTCFullYear();
  const targetMonth = firstOfTargetMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(date.getUTCDate(), lastDay)),
  );
}

export function daysBetween(fromDate, toDate) {
  const from = parseDateOnly(fromDate, "fromDate");
  const to = parseDateOnly(toDate, "toDate");
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function getWarrantyStatus(expiryDate, now = todayDateOnly(), thresholdDays = 30) {
  const daysRemaining = daysBetween(now, expiryDate);
  if (daysRemaining <= 0) {
    return { status: "expired", daysRemaining };
  }
  if (daysRemaining <= thresholdDays) {
    return { status: "expiringSoon", daysRemaining };
  }
  return { status: "active", daysRemaining };
}

export function getReturnStatus(returnDeadline, now = todayDateOnly(), thresholdDays = 7) {
  if (!returnDeadline) return { status: "none", daysRemaining: null };
  const daysRemaining = daysBetween(now, returnDeadline);
  if (daysRemaining < 0) return { status: "passed", daysRemaining };
  if (daysRemaining <= thresholdDays) return { status: "closing", daysRemaining };
  return { status: "upcoming", daysRemaining };
}

function asIso(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function purchaseToApi(doc) {
  const record = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const purchaseDate = dateOnlyString(record.purchaseDate);
  const warrantyExpiryDate = dateOnlyString(record.warrantyExpiryDate);
  const returnDeadline = dateOnlyString(record.returnDeadline);
  return {
    id: String(record._id ?? record.id),
    productName: record.productName,
    brand: record.brand,
    category: record.category,
    price: Number(record.price),
    currency: record.currency ?? "USD",
    purchaseDate,
    warrantyMonths: Number(record.warrantyDurationMonths ?? record.warrantyMonths ?? 0),
    warrantyExpiryDate,
    returnDeadline,
    serialNumber: record.serialNumber ?? "",
    invoiceNumber: record.invoiceNumber ?? null,
    sellerName: record.sellerName ?? null,
    notes: record.notes ?? null,
    warrantyStatus: getWarrantyStatus(warrantyExpiryDate).status,
    returnStatus: getReturnStatus(returnDeadline).status,
    createdAt: asIso(record.createdAt),
    updatedAt: asIso(record.updatedAt),
  };
}

export function documentToApi(doc) {
  const record = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(record._id ?? record.id),
    purchaseId: String(record.purchaseId),
    documentType: record.documentType,
    originalFilename: record.originalFilename,
    uploadedAt: asIso(record.uploadedAt ?? record.createdAt),
  };
}

export function serviceRecordToApi(doc) {
  const record = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(record._id ?? record.id),
    purchaseId: String(record.purchaseId),
    serviceDate: dateOnlyString(record.serviceDate),
    serviceCenter: record.serviceCenter,
    description: record.description,
    expense: Number(record.expense),
    currency: record.currency ?? "USD",
    status: record.status,
    receiptDocumentId: record.receiptDocumentId ? String(record.receiptDocumentId) : null,
    createdAt: asIso(record.createdAt),
    updatedAt: asIso(record.updatedAt),
  };
}

export function notificationToApi(doc) {
  const record = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(record._id ?? record.id),
    purchaseId: String(record.purchaseId),
    type: record.type,
    message: record.message,
    scheduledFor: dateOnlyString(record.scheduledFor),
    readAt: record.readAt ? asIso(record.readAt) : null,
    createdAt: asIso(record.createdAt),
  };
}
