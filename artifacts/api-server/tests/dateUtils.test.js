import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarMonths,
  getReturnStatus,
  getWarrantyStatus,
  parseDateOnly,
} from "../src/lib/dateUtils.js";

test("calendar month addition clamps to the last valid day", () => {
  assert.equal(addCalendarMonths("2025-01-31", 1).toISOString().slice(0, 10), "2025-02-28");
  assert.equal(addCalendarMonths("2024-01-31", 1).toISOString().slice(0, 10), "2024-02-29");
});

test("date-only parsing rejects impossible calendar dates", () => {
  assert.equal(parseDateOnly("2024-02-29").toISOString().slice(0, 10), "2024-02-29");
  assert.throws(() => parseDateOnly("2025-02-29"), /valid calendar date/);
});

test("warranty status uses inclusive 30-day expiring-soon window", () => {
  assert.equal(getWarrantyStatus("2026-10-22", "2026-10-22").status, "expired");
  assert.equal(getWarrantyStatus("2026-11-21", "2026-10-22").status, "expiringSoon");
  assert.equal(getWarrantyStatus("2026-11-22", "2026-10-22").status, "active");
});

test("return status distinguishes absent, closing, upcoming, and passed dates", () => {
  assert.equal(getReturnStatus(null, "2026-10-22").status, "none");
  assert.equal(getReturnStatus("2026-10-22", "2026-10-22").status, "closing");
  assert.equal(getReturnStatus("2026-10-30", "2026-10-22").status, "upcoming");
  assert.equal(getReturnStatus("2026-10-21", "2026-10-22").status, "passed");
});
