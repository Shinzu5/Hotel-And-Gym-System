"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStats } from "@/lib/useStats";
import { peso, toDateInput } from "@/lib/format";
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Field,
  SearchInput,
  SelectInput,
  Skeleton,
  TextArea,
  TextInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { useToasts } from "@/components/Toasts";

const todayISO = () => toDateInput(new Date());

/** "8:12 AM" — returns "—" when the payload carries no time of day. */
function formatTime(value) {
  if (!value) return "—";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "—"; // date-only, no time stored
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const paymentDate = (p) => p.paidAt || p.date || p.createdAt;

/** "Today · Oct 20, 2026" / "Oct 19, 2026" for the date dropdown. */
function labelDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const formatted = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return iso === todayISO() ? `Today · ${formatted}` : formatted;
}

export default function PaymentsPage() {
  const { push } = useToasts();
  const { stats, refresh: refreshStats } = useStats();

  const [payments, setPayments] = useState([]);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState(() => todayISO());
  // Debounced search box (300ms) — mirrors the Members tab.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Submit payment form
  const emptyForm = () => ({
    memberName: "",
    amount: "",
    itemName: "",
    date: todayISO(),
    notes: "",
  });
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Close daily sales modal
  const [closeOpen, setCloseOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  // What was just archived — drives the "moved to Reports" banner.
  const [closedSummary, setClosedSummary] = useState(null);

  // Delete confirmation
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadPayments = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (dateFilter && dateFilter !== "all") params.set("date", dateFilter);
      if (search) params.set("q", search);
      const qs = params.toString();
      const data = await api.get(`/payments${qs ? `?${qs}` : ""}`);
      const rows = Array.isArray(data) ? data : Array.isArray(data?.payments) ? data.payments : [];
      setPayments(rows);
      // The API returns every day that has open receipts, so the dropdown
      // keeps its full list even while a search is active.
      if (Array.isArray(data?.dates)) setDates(data.dates);
      return rows;
    } catch (err) {
      setError(err?.message || "Failed to load payments.");
      return [];
    } finally {
      setLoading(false);
    }
  }, [dateFilter, search]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  /* ------------------------------ debounced q ------------------------------ */

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* ------------------------------ date filter ----------------------------- */

  // The days that have open receipts come from the API (not from the loaded
  // rows) so the dropdown does not shrink when a search narrows the list.
  const dateOptions = useMemo(() => {
    const set = new Set(dates);
    set.add(todayISO()); // "Today" is always selectable
    return Array.from(set).sort().reverse();
  }, [dates]);

  // The API applies the date and the search, so the rows are already filtered.
  const visiblePayments = payments;
  const filtersActive = Boolean(search) || (dateFilter && dateFilter !== "all");

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setDateFilter("all");
  };

  /* ------------------------------ submit form ----------------------------- */

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const amount = Number(form.amount);
    if (!form.memberName.trim()) {
      setFormError("Customer / member name is required.");
      return;
    }
    if (!form.itemName.trim()) {
      setFormError("Item / service purchased is required.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await api.post("/payments", {
        memberName: form.memberName.trim(),
        amount,
        itemName: form.itemName.trim(),
        notes: form.notes.trim() || undefined,
        date: form.date || todayISO(),
        method: "cash",
      });
      push("Payment recorded.", "success");
      setForm(emptyForm());
      // Socket push is the primary refresh; this keeps it working without one.
      await Promise.all([loadPayments(), refreshStats()]);
    } catch (err) {
      push(err?.message || "Failed to record payment.", "error");
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------- close daily sales -------------------------- */

  const openCloseModal = async () => {
    setCloseOpen(true);
    setCloseError("");
    setSummary(null);
    setSummaryLoading(true);
    try {
      const data = await api.get(`/payments/summary?date=${todayISO()}`);
      setSummary(data || null);
    } catch (err) {
      setCloseError(err?.message || "Could not load today's summary.");
    } finally {
      setSummaryLoading(false);
    }
  };

  // The OPEN figures — what "Close Daily Sales" acts on. They drop to zero
  // the moment the day is closed out.
  const totalSales = summary?.openTotalSales ?? stats?.openSales ?? 0;
  const transactionCount = summary?.openTransactionCount ?? stats?.openTransactions ?? 0;

  const confirmClose = async () => {
    if (closing) return;
    setClosing(true);
    setCloseError("");
    const closedDate = toDateInput(summary?.date) || todayISO();
    try {
      const result = await api.post("/payments/close-sales", { date: closedDate });
      setCloseOpen(false);
      setClosedSummary({
        date: closedDate,
        totalSales: result?.totalSales ?? totalSales,
        transactionCount: result?.transactionCount ?? transactionCount,
      });
      push(
        `Daily sales closed — ${peso(result?.totalSales ?? totalSales)} moved to Reports.`,
        "success",
        { label: "View in Reports", href: "/dashboard/reports" }
      );
      // Jump to the receipt history, filtered to the closed date.
      setDateFilter(closedDate);
      await Promise.all([loadPayments(), refreshStats()]);
      document
        .getElementById("receipt-history")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      const message = err?.message || "Failed to close daily sales.";
      setCloseError(message);
      push(message, "error");
    } finally {
      setClosing(false);
    }
  };

  /* -------------------------------- delete -------------------------------- */

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await api.del(`/payments/${deleting.id}`);
      push("Payment deleted.", "success");
      setDeleting(null);
      await Promise.all([loadPayments(), refreshStats()]);
    } catch (err) {
      push(err?.message || "Failed to delete payment.", "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display-heading text-2xl text-gray-900 sm:text-3xl">Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Record sales and close daily sales into Reports.
          </p>
        </div>
        <Button variant="danger" size="lg" onClick={openCloseModal}>
          <CalendarClock className="h-4 w-4" />
          Close Daily Sales
        </Button>
      </header>

      {/* Open-sale KPIs */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-4 px-5 py-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Today&apos;s Close (Open)</p>
            <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-gray-900">
              {peso(stats?.openSales)}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 px-5 py-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <CreditCard className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Open Transactions</p>
            <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-gray-900">
              {stats?.openTransactions ?? 0}
            </p>
          </div>
        </Card>
      </section>

      {/* Submit payment */}
      <Card>
        <CardHeader
          title="Submit Payment"
          subtitle="Record a walk-in sale or member purchase."
        />
        <form onSubmit={handleSubmit} className="grid gap-4 px-5 py-5 lg:grid-cols-2">
          {formError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 lg:col-span-2">
              {formError}
            </div>
          ) : null}

          <Field label="Customer / Member Name" htmlFor="pay-customer" className="lg:col-span-1">
            <TextInput
              id="pay-customer"
              value={form.memberName}
              onChange={setField("memberName")}
              placeholder="e.g. Lance Aquino, Walk-in guest"
              autoComplete="off"
            />
          </Field>

          <Field label="Amount" htmlFor="pay-amount">
            <TextInput
              id="pay-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              prefix="₱"
              value={form.amount}
              onChange={setField("amount")}
              placeholder="0.00"
            />
          </Field>

          <Field label="Item / Service Purchased" htmlFor="pay-item">
            <TextInput
              id="pay-item"
              value={form.itemName}
              onChange={setField("itemName")}
              placeholder="Protein shakes, Personal training, Walk-in…"
              autoComplete="off"
            />
          </Field>

          <Field label="Date" htmlFor="pay-date">
            <TextInput id="pay-date" type="date" value={form.date} onChange={setField("date")} />
          </Field>

          <Field label="Notes (optional)" htmlFor="pay-notes" className="lg:col-span-2">
            <TextArea
              id="pay-notes"
              value={form.notes}
              onChange={setField("notes")}
              placeholder="Anything worth remembering about this sale…"
            />
          </Field>

          <div className="flex justify-end lg:col-span-2">
            <Button type="submit" variant="primary" size="lg" disabled={saving}>
              {saving ? "Saving…" : "Submit Payment"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Payment receipt history */}
      <Card id="receipt-history" className="scroll-mt-24 px-0 py-0">
        <div className="card-header">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CalendarClock className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="card-title">Payment receipt history</h2>
              <p className="card-subtitle">
                {search
                  ? `${visiblePayments.length} receipt${visiblePayments.length === 1 ? "" : "s"} matching "${search}"`
                  : dateFilter === "all"
                    ? `${visiblePayments.length} receipt${visiblePayments.length === 1 ? "" : "s"} on file`
                    : `${visiblePayments.length} receipt${visiblePayments.length === 1 ? "" : "s"} on this day`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search name, item or notes"
              className="w-full sm:w-60"
            />
            <label htmlFor="receipt-date" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Date
            </label>
            <SelectInput
              id="receipt-date"
              className="w-auto min-w-[11rem] py-2"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter receipts by date"
            >
              <option value="all">All dates</option>
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {labelDate(d)}
                </option>
              ))}
            </SelectInput>
            <input
              id="receipt-picker"
              type="date"
              aria-label="Jump to a date"
              value={dateFilter === "all" ? "" : dateFilter}
              onChange={(e) => setDateFilter(e.target.value || "all")}
              className="input-base w-auto py-2"
            />
            {filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {closedSummary ? (
          <div className="mx-5 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <p className="min-w-0 flex-1 text-sm text-green-900">
              <span className="font-bold">
                {peso(closedSummary.totalSales)} closed and archived
              </span>{" "}
              — {closedSummary.transactionCount}{" "}
              {closedSummary.transactionCount === 1 ? "receipt" : "receipts"} moved to Reports.
            </p>
            <Link
              href="/dashboard/reports"
              className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 transition hover:text-green-800"
            >
              View in Reports
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-cell">Time</th>
                <th className="th-cell">Customer / Member</th>
                <th className="th-cell">Item / Service</th>
                <th className="th-cell">Notes</th>
                <th className="th-cell th-cell-right">Amount</th>
                <th className="th-cell th-cell-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="space-y-3 p-5">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-9 w-40" />
                          <Skeleton className="h-4 flex-1" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-red-600">{error}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={loadPayments}>
                      Try again
                    </Button>
                  </td>
                </tr>
              ) : visiblePayments.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={ReceiptText}
                      title="No open receipts here"
                      message={
                        closedSummary
                          ? "This day's sales were closed and archived. Find every receipt in Reports."
                          : "Submitted payments for this date will show up in real time. Closed sales move to Reports."
                      }
                      action={
                        <Link
                          href="/dashboard/reports"
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-on-accent shadow-sm transition hover:brightness-95"
                        >
                          Go to Reports
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      }
                    />
                  </td>
                </tr>
              ) : (
                visiblePayments.map((pay) => {
                  const label = pay.memberName || "Walk-in guest";
                  const key = pay.id ?? `${label}-${pay.paidAt}-${pay.amount}`;
                  const isMember = Boolean(pay.memberId);
                  return (
                    <tr key={key} className="row-hover">
                      <td className="td-cell whitespace-nowrap font-medium text-gray-500">
                        {formatTime(paymentDate(pay))}
                      </td>
                      <td className="td-cell">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={label} />
                          <span className="font-semibold text-gray-900">{label}</span>
                          {/* Tagged automatically so it is obvious at a glance
                              whether this sale came from a registered member
                              or a walk-in. */}
                          {isMember ? <Chip tone="green">Member</Chip> : null}
                        </div>
                      </td>
                      <td className="td-cell text-gray-600">{pay.itemName || "—"}</td>
                      <td className="td-cell max-w-[16rem] text-gray-500">
                        <span className="line-clamp-2">{pay.notes || "—"}</span>
                      </td>
                      <td className="td-cell text-right font-semibold text-gray-900">
                        {peso(pay.amount)}
                      </td>
                      <td className="td-cell">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            aria-label="Delete payment"
                            onClick={() => setDeleting(pay)}
                            className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Close daily sales modal */}
      <Modal
        open={closeOpen}
        onClose={() => {
          if (!closing) setCloseOpen(false);
        }}
        accent="danger"
        title="Close daily sales?"
        subtitle="Today's open transactions will be moved into Reports."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseOpen(false)} disabled={closing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmClose} disabled={closing || summaryLoading || totalSales <= 0}>
              {closing ? "Closing…" : "Close Daily Sales"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Open sales
              </p>
              {summaryLoading ? (
                <Skeleton className="mt-2 h-7 w-24" />
              ) : (
                <p className="mt-1 text-xl font-bold tracking-tight text-gray-900">
                  {peso(totalSales)}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Open transactions
              </p>
              {summaryLoading ? (
                <Skeleton className="mt-2 h-7 w-16" />
              ) : (
                <p className="mt-1 text-xl font-bold tracking-tight text-gray-900">
                  {transactionCount}
                </p>
              )}
            </div>
          </div>

          {closeError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {closeError}
            </div>
          ) : summaryLoading ? null : totalSales <= 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Nothing left to close — today&apos;s sales are already closed out and archived in
              Reports.
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Closing moves today&apos;s open transactions into a dated report so tomorrow starts
              from zero. This can&apos;t be undone from here.
            </p>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleting}
        onClose={() => {
          if (!deleteBusy) setDeleting(null);
        }}
        accent="danger"
        title="Delete this payment?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete payment"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <Avatar name={deleting?.memberName || "Guest"} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-semibold text-gray-900">
                {deleting?.memberName || "Walk-in guest"}
                {deleting?.memberId ? <Chip tone="green">Member</Chip> : null}
              </p>
              <p className="truncate text-xs text-gray-500">{deleting?.itemName || "—"}</p>
            </div>
            <span className="text-sm font-bold text-gray-900">{peso(deleting?.amount)}</span>
          </div>
          <p className="text-sm text-gray-500">
            The receipt will be removed from the payment history and today&apos;s totals will be
            updated. This can&apos;t be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
