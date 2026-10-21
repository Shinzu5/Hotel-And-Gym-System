"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Modal, TextInput } from "@/components/ui";
import { pesoWhole, expirationFor, toDateInput } from "@/lib/format";

/* ------------------------------- Date helpers ------------------------------ */

function parseISO(value) {
  const [y, m, d] = String(value || "")
    .split("-")
    .map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-10-20" + 12 months -> "2027-10-20" (month overflow clamped by Date). */
export function addMonths(iso, months) {
  const date = parseISO(iso);
  if (!date) return "";
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + Number(months), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toDateInput(target);
}

/**
 * Calendar months between two dates, including the trailing day fraction
 * (May 20 2026 -> May 23 2027 = 12.1 months) so "Total lease value" lines up
 * with the 3/6/12/24-month quick picks.
 */
export function monthsBetween(startISO, endISO) {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!start || !end || end.getTime() <= start.getTime()) return 0;

  const whole = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const anniversary = new Date(start.getFullYear(), start.getMonth() + whole, start.getDate());
  if (end.getTime() <= anniversary.getTime()) return whole;

  const nextAnniversary = new Date(start.getFullYear(), start.getMonth() + whole + 1, start.getDate());
  const span = nextAnniversary.getTime() - anniversary.getTime();
  const fraction = span > 0 ? (end.getTime() - anniversary.getTime()) / span : 0;
  return whole + fraction;
}

/* ------------------------------- Add / Edit ------------------------------- */

const QUICK_TERMS = [3, 6, 12, 24];

/** Extra "short term" pick — 30 days, using the same date rule as the gym. */
const SHORT_TERM_DAYS = 30;

/**
 * "Add renter · Unit 2A" / "Edit lease · Unit 1A" — the booking form from the
 * design: renter, contact, rent, dates, quick term picks and a live
 * "Total lease value".
 */
export function LeaseModal({ open, unit, lease = null, onClose, onSaved }) {
  const isEdit = Boolean(lease);
  const [form, setForm] = useState({ renterName: "", contact: "", monthlyRent: "", startDate: "", endDate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(null);

  // Reset once per target (open -> specific unit/lease). Guarded by a key so a
  // background stats refresh replacing the object identity never wipes typing.
  useEffect(() => {
    const key = open && unit ? `${unit.id}:${lease ? lease.id : "new"}` : null;
    if (key && key !== keyRef.current) {
      keyRef.current = key;
      const start = toDateInput(lease ? lease.startDate : new Date());
      setForm({
        renterName: lease ? lease.renterName : "",
        contact: (lease && lease.contact) || "",
        monthlyRent: String(lease ? lease.monthlyRent : unit.monthlyRent ?? ""),
        startDate: start,
        endDate: toDateInput(lease ? lease.endDate : addMonths(start, 12)),
      });
      setError("");
    }
    if (!open) keyRef.current = null;
  }, [open, unit, lease]);

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const months = monthsBetween(form.startDate, form.endDate);
  const leaseValue = (Number(form.monthlyRent) || 0) * months;
  const activeTerm = QUICK_TERMS.find((n) => form.endDate === addMonths(form.startDate, n));
  const activeShortTerm = form.endDate === expirationFor(form.startDate, SHORT_TERM_DAYS);

  const validate = () => {
    if (!form.renterName.trim()) return "The renter's name is required.";
    const rent = Number(form.monthlyRent);
    if (!form.monthlyRent || Number.isNaN(rent) || rent <= 0) return "Monthly rent must be greater than zero.";
    if (!parseISO(form.startDate)) return "A start date is required.";
    if (!parseISO(form.endDate)) return "An expiration date is required.";
    if (parseISO(form.endDate).getTime() <= parseISO(form.startDate).getTime()) {
      return "The expiration date must be after the start date.";
    }
    return "";
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        renterName: form.renterName.trim(),
        contact: form.contact.trim(),
        monthlyRent: Number(form.monthlyRent),
        startDate: form.startDate,
        endDate: form.endDate,
      };
      if (isEdit) await api.put(`/residences/leases/${lease.id}`, payload);
      else await api.post("/residences/leases", { ...payload, unitId: unit.id });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Could not save the lease.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      accent="green"
      title={`${isEdit ? "Edit lease" : "Add renter"} · ${unit ? unit.name : ""}`}
      subtitle="The lease is booked until its expiration."
      footer={
        <>
          <div className="mr-auto">
            <p className="text-xs font-medium text-gray-500">Total lease value</p>
            <p className="text-base font-bold text-gray-900">{pesoWhole(leaseValue)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">Applied automatically when you save</p>
          </div>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save lease"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Renter name" htmlFor="lease-renter">
          <TextInput
            id="lease-renter"
            value={form.renterName}
            onChange={set("renterName")}
            placeholder="Full name"
            autoComplete="off"
          />
        </Field>

        <Field label="Contact" htmlFor="lease-contact">
          <TextInput
            id="lease-contact"
            value={form.contact}
            onChange={set("contact")}
            placeholder="0917 000 0000"
            inputMode="tel"
            autoComplete="off"
          />
        </Field>

        <Field label="Monthly rent" htmlFor="lease-rent">
          <TextInput
            id="lease-rent"
            prefix="₱"
            value={form.monthlyRent}
            onChange={set("monthlyRent")}
            placeholder="0"
            inputMode="decimal"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="lease-start">
            <TextInput id="lease-start" type="date" value={form.startDate} onChange={set("startDate")} />
          </Field>
          <Field label="Expiration date" htmlFor="lease-end">
            <TextInput id="lease-end" type="date" value={form.endDate} onChange={set("endDate")} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!parseISO(form.startDate)}
            onClick={() =>
              setForm((f) => ({ ...f, endDate: expirationFor(f.startDate, SHORT_TERM_DAYS) }))
            }
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              activeShortTerm
                ? "border-green-600 bg-green-600 text-on-accent shadow-sm"
                : "border-gray-300 bg-white text-gray-600 hover:border-green-500 hover:text-green-700"
            }`}
          >
            {SHORT_TERM_DAYS} days
          </button>
          {QUICK_TERMS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={!parseISO(form.startDate)}
              onClick={() => setForm((f) => ({ ...f, endDate: addMonths(f.startDate, n) }))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                activeTerm === n
                  ? "border-green-600 bg-green-600 text-on-accent shadow-sm"
                  : "border-gray-300 bg-white text-gray-600 hover:border-green-500 hover:text-green-700"
              }`}
            >
              {n} months
            </button>
          ))}
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* --------------------------------- End lease -------------------------------- */

/** Destructive confirm — ends the lease and frees the unit. */
export function EndLeaseModal({ open, lease, unit, onClose, onEnded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const confirm = async () => {
    if (!lease) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/residences/leases/${lease.id}/end`, {});
      onEnded?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Could not end the lease.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      accent="danger"
      title="End this lease?"
      subtitle={unit ? `${unit.name} will be marked vacant straight away.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep lease
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            {busy ? "Ending…" : "End lease"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-gray-600">
        <p>
          <span className="font-semibold text-gray-900">{lease ? lease.renterName : ""}</span> will be
          checked out and {unit ? unit.name : "the unit"} becomes available to rent again. The rent
          history stays on the unit&apos;s record.
        </p>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
