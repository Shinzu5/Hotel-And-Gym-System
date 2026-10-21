const phpCurrency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const phpWhole = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const grouped = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

/** "₱1,950.00" — cents included (stat cards, table amounts). */
export const peso = (value) => phpCurrency.format(Number(value) || 0);

/** "₱486,250" — whole pesos (big revenue figures, plan prices). */
export const pesoWhole = (value) => phpWhole.format(Number(value) || 0);

/** "PHP 486,250" — sidebar style label. */
export const pesoLabel = (value) => `PHP ${grouped.format(Number(value) || 0)}`;

/** "Oct 19, 2026" (falls back to the raw string when unparseable). */
export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 19, 2026, 3:05 PM" */
export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

const pad2 = (n) => String(n).padStart(2, "0");

/** Input[type=date] value (yyyy-mm-dd). */
export function toDateInput(value) {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  // A bare "yyyy-mm-dd" is a LOCAL calendar date, not UTC midnight — parsing
  // it as UTC shifts it a day west of Greenwich.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse a date into a local Date. Handles "yyyy-mm-dd" as a local day. */
function parseLocal(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local midnight of a date. */
function startOfDay(value) {
  const d = parseLocal(value) || new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* -------------------------------------------------------------------------- *
 * Date rules — the same convention the backend uses (backend/src/lib/dates.js)
 *
 *   * A MONTH-LENGTH term (28-31 days, or N months) runs to the same
 *     day-of-month one month later:  30 days from Oct 20 -> Nov 20, 30 days left.
 *   * A FIXED-DAY term lasts N days counting the enrolment day, and the
 *     expiration is its LAST usable day:  15 days from Oct 21 -> Nov 4, 15 days left.
 * -------------------------------------------------------------------------- */

/** Add N calendar days to a date. */
export function addDays(value, days) {
  const d = parseLocal(value);
  if (!d) return "";
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(days || 0));
  return toDateInput(out);
}

/** Add N calendar months (the day-of-month is kept where possible). */
export function addMonths(value, months) {
  const d = parseLocal(value);
  if (!d) return "";
  const target = new Date(d.getFullYear(), d.getMonth() + Number(months || 0), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return toDateInput(target);
}

/** A term of ~a month is billed by the calendar month; anything shorter is fixed days. */
export function isMonthTerm(durationDays) {
  const days = Number(durationDays) || 0;
  return days >= 28 && days <= 31;
}

/** The expiration for a term of `durationDays` starting on `value`. */
export function expirationFor(value, durationDays) {
  const days = Number(durationDays) || 0;
  if (isMonthTerm(days)) return addMonths(value, 1);
  return addDays(value, Math.max(0, days - 1));
}

/**
 * Days still usable after today for an expiration date.
 * A month-length term counts the days that remain; a fixed-day term counts
 * today as well. 0 once it is expired.
 */
export function daysLeftFor(endValue, nowValue, monthTerm = false) {
  const end = parseLocal(endValue);
  if (!end) return 0;
  const now = parseLocal(nowValue) || new Date();
  const diff = Math.round(
    (startOfDay(end).getTime() - startOfDay(now).getTime()) / 86400000
  );
  if (diff < 0) return 0;
  if (monthTerm) return diff === 0 ? 0 : Math.max(1, diff - 1);
  return diff + 1;
}

/** Days left for a month-length term (the default for leases). */
export function daysLeftUntil(endValue, nowValue) {
  return daysLeftFor(endValue, nowValue, true);
}
/**
 * The expiration after renewing by `days` — a live membership gains the days
 * on top of what is left, an expired one restarts from tomorrow.
 */
export function renewalExpiration(currentEnd, days) {
  const now = new Date();
  const end = parseLocal(currentEnd);
  const base =
    end && end.getTime() > now.getTime()
      ? startOfDay(end)
      : (() => {
          const t = startOfDay(now);
          return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
        })();
  const out = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + Number(days || 0)
  );
  return toDateInput(out);
}

/** "JD" from "Juan Dela Cruz" */
export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

/** Works with both { id } and Mongo-style { _id } documents. */
export const idOf = (obj) => (obj && (obj.id ?? obj._id)) || "";

/** "PAID" -> "paid" */
export const statusKey = (status) => String(status || "").toLowerCase();

export function titleCase(status) {
  const key = statusKey(status);
  if (!key) return "—";
  return key[0].toUpperCase() + key.slice(1);
}

/** ACTIVE/EXPIRED — explicit status wins, otherwise derive from endDate. */
export function memberStatus(member = {}) {
  if (member.status) return statusKey(member.status).toUpperCase();
  if (member.endDate) {
    const end = new Date(member.endDate);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return "EXPIRED";
  }
  return "ACTIVE";
}

export const memberName = (member = {}) =>
  member.fullName || member.name || member.username || "Unknown";

export const planName = (plan = {}) =>
  typeof plan === "string" ? plan : plan.name || "—";

export function greetingForHour(hour = new Date().getHours()) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
