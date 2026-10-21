// One source of truth for every date calculation in the app.
//
// THE CONVENTION
// --------------
// A membership or lease lasts a TERM, and there are two kinds:
//
//   * a MONTH-LENGTH term (28-31 days, or N months) runs to the same
//     day-of-month, one month later:
//
//         30 days from Oct 20  ->  expires Nov 20,  30 days left on Oct 20
//
//   * a FIXED-DAY term lasts N days counting the enrolment day, and the
//     expiration is its LAST usable day:
//
//         15 days from Oct 21  ->  expires Nov 4,   15 days left on Oct 21
//
// The days-left count is the number of usable days remaining: it includes
// today for a fixed-day term and excludes it for a month-length term, which
// is what makes a 30-day plan read "30 days left" on the day it is bought.
//
// Everything is computed on whole local calendar days — comparing raw
// timestamps made the answer depend on the time of day.

const MS_DAY = 24 * 60 * 60 * 1000

const toDate = (value) => (value instanceof Date ? value : new Date(value))

/** Local midnight of the given date. */
function startOfDay(value = new Date()) {
  const d = toDate(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Local midnight tomorrow. */
function startOfTomorrow(value = new Date()) {
  const d = startOfDay(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

/** Whole calendar days from `a` to `b` — the time of day is ignored. */
function calendarDaysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_DAY)
}

/** Add N calendar days. */
function addDays(value, days) {
  const d = startOfDay(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(days || 0))
}

/** Add N calendar months (the day-of-month is kept where possible). */
function addMonths(value, months) {
  const d = startOfDay(value)
  const target = new Date(d.getFullYear(), d.getMonth() + Number(months || 0), 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), lastDay))
  return target
}

/** A term of ~a month is billed by the calendar month; anything shorter is fixed days. */
function isMonthTerm(durationDays) {
  const days = Number(durationDays) || 0
  return days >= 28 && days <= 31
}

/**
 * The expiration date for a term of `durationDays` starting on `start`.
 *
 *   15 days from Oct 21 -> Nov 4   (the last usable day)
 *   30 days from Oct 20 -> Nov 20  (the same day next month)
 */
function expirationFor(start, durationDays) {
  const days = Number(durationDays) || 0
  if (isMonthTerm(days)) return addMonths(start, 1)
  return addDays(start, Math.max(0, days - 1))
}

/**
 * Days still usable after `now` for an expiration date.
 *
 * A month-length term counts the days that remain (today excluded); a
 * fixed-day term counts today as well. Returns 0 once it is expired.
 */
function daysLeftFor(endDate, now = new Date(), { monthTerm = false } = {}) {
  const diff = calendarDaysBetween(now, endDate)
  if (diff < 0) return 0
  if (monthTerm) return diff === 0 ? 0 : Math.max(1, diff - 1)
  return diff + 1
}

/**
 * Days left for a month-length term (the default for leases, whose terms are
 * always calendar months).
 */
function daysLeftUntil(endDate, now = new Date()) {
  return daysLeftFor(endDate, now, { monthTerm: true })
}

/**
 * The months a lease covers, with a day fraction for the tail.
 *
 * A lease from Oct 20 to Nov 20 is exactly 1 month; Oct 20 to Nov 4 is 0.5.
 * The lease modal shows the same figure as "Total lease value", so the
 * backend and the UI can never disagree about the amount.
 */
function monthsBetween(start, end) {
  const s = startOfDay(start)
  const e = startOfDay(end)
  if (e.getTime() <= s.getTime()) return 0

  const whole = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  const anniversary = new Date(s.getFullYear(), s.getMonth() + whole, s.getDate())
  if (e.getTime() <= anniversary.getTime()) return whole

  const next = new Date(s.getFullYear(), s.getMonth() + whole + 1, s.getDate())
  const span = next.getTime() - anniversary.getTime()
  const fraction = span > 0 ? (e.getTime() - anniversary.getTime()) / span : 0
  return whole + fraction
}

/**
 * The expiration after renewing by `days`.
 *
 * A live membership simply gains the days on top of what is left; an expired
 * one restarts from tomorrow.
 */
function renewalExpiration(currentEnd, days, now = new Date()) {
  const end = currentEnd ? toDate(currentEnd) : null
  const base =
    end && end.getTime() > now.getTime() ? startOfDay(end) : startOfTomorrow(now)
  return addDays(base, Number(days || 0))
}

module.exports = {
  MS_DAY,
  startOfDay,
  startOfTomorrow,
  calendarDaysBetween,
  addDays,
  addMonths,
  isMonthTerm,
  expirationFor,
  daysLeftFor,
  daysLeftUntil,
  monthsBetween,
  renewalExpiration,
}
