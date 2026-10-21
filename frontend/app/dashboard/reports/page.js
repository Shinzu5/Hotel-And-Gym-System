"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronDown, FileBarChart, ReceiptText, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, peso, pesoWhole, toDateInput } from "@/lib/format";
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  ErrorState,
  SearchInput,
  Skeleton,
} from "@/components/ui";

const todayISO = () => toDateInput(new Date());

/** "Today · Oct 21, 2026" / "Oct 20, 2026". */
function labelDate(value) {
  const iso = toDateInput(value);
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  const formatted = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return iso === todayISO() ? `Today · ${formatted}` : formatted;
}

/** "8:12 AM" — receipts carry a time of day, closed days do not. */
function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ReportsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Expanded day -> its receipts.
  const [openId, setOpenId] = useState(null);
  const [receipts, setReceipts] = useState(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

  // Filters: a debounced search across the archived receipts, and a date.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  // Matching receipts (search mode).
  const [hits, setHits] = useState(null);
  const [hitsLoading, setHitsLoading] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api.get("/reports/closed");
      setData({
        reports: Array.isArray(res?.reports) ? res.reports : [],
        totals: res?.totals || {},
      });
    } catch (err) {
      setError(err?.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search term (300ms) — same as the Members tab.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Search the archived receipts.
  useEffect(() => {
    if (!search) {
      setHits(null);
      setHitsLoading(false);
      return;
    }
    let cancelled = false;
    setHitsLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("q", search);
        if (dateFilter) params.set("date", dateFilter);
        const res = await api.get(`/reports/search?${params.toString()}`);
        if (!cancelled) setHits(Array.isArray(res?.receipts) ? res.receipts : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to search the reports.");
          setHits([]);
        }
      } finally {
        if (!cancelled) setHitsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, dateFilter]);

  const toggle = useCallback(
    async (id) => {
      if (openId === id) {
        setOpenId(null);
        setReceipts(null);
        return;
      }
      setOpenId(id);
      setReceipts(null);
      setReceiptsLoading(true);
      try {
        const res = await api.get(`/reports/${id}/receipts`);
        setReceipts(Array.isArray(res?.receipts) ? res.receipts : []);
      } catch (err) {
        setError(err?.message || "Failed to load the receipts for that day.");
        setReceipts([]);
      } finally {
        setReceiptsLoading(false);
      }
    },
    [openId]
  );

  const reports = data?.reports || [];
  const totals = data?.totals || {};

  // The date picker narrows the day list and auto-expands the matching day.
  const visibleReports = useMemo(
    () => (dateFilter ? reports.filter((r) => toDateInput(r.date) === dateFilter) : reports),
    [reports, dateFilter]
  );

  const filtersActive = Boolean(search) || Boolean(dateFilter);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setDateFilter("");
  };

  const jumpToDay = useCallback(
    async (report) => {
      const day = toDateInput(report?.date);
      if (day) setDateFilter(day);
      if (report?.id) {
        setOpenId(report.id);
        setReceipts(null);
        setReceiptsLoading(true);
        try {
          const res = await api.get(`/reports/${report.id}/receipts`);
          setReceipts(Array.isArray(res?.receipts) ? res.receipts : []);
        } catch {
          setReceipts([]);
        } finally {
          setReceiptsLoading(false);
        }
      }
    },
    []
  );

  const kpis = useMemo(
    () => [
      {
        label: "Total closed sales",
        value: peso(totals.totalSales),
        sub: `${totals.transactionCount || 0} transactions archived`,
        icon: Wallet,
      },
      {
        label: "Days closed",
        value: String(totals.daysClosed || 0),
        sub: "Daily sales rolled into a report",
        icon: CalendarClock,
      },
      {
        label: "Transactions closed",
        value: String(totals.transactionCount || 0),
        sub: "Receipts moved out of Payments",
        icon: ReceiptText,
      },
      {
        label: "Average per day",
        value: pesoWhole(totals.averagePerDay || 0),
        sub: "Total closed sales ÷ days closed",
        icon: FileBarChart,
      },
    ],
    [totals]
  );

  if (error && !data) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display-heading text-2xl text-gray-900 sm:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every closed day, with the receipts that made it up.
          </p>
        </div>
        <Link
          href="/dashboard/payments"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600 transition hover:text-green-700"
        >
          Close today&apos;s sales
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <Card key={i} className="px-5 py-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-3 h-7 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
              </Card>
            ))
          : kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {kpi.label}
                    </p>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-50 text-green-600">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <p className="display-heading mt-2 text-2xl text-gray-900">{kpi.value}</p>
                  <p className="mt-1 text-xs text-gray-500">{kpi.sub}</p>
                </Card>
              );
            })}
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search archived receipts by name, item or notes"
          className="w-full sm:w-80"
        />
        <input
          id="report-picker"
          type="date"
          aria-label="Filter by the day that was closed"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="input-base w-auto py-2"
        />
        {filtersActive ? (
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}
      </section>

      {/* Matching receipts (search mode) */}
      {search ? (
        <Card>
          <CardHeader
            title="Matching receipts"
            subtitle={
              hitsLoading
                ? "Searching the archive…"
                : `${hits?.length || 0} archived receipt${(hits?.length || 0) === 1 ? "" : "s"} match "${search}"`
            }
          />
          <div className="overflow-x-auto">
            {hitsLoading ? (
              <div className="space-y-3 px-5 py-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !hits || hits.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">
                No archived receipt matches that search.
              </p>
            ) : (
              <table className="data-table" data-testid="report-hits">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="th-cell">Closed on</th>
                    <th className="th-cell">Customer / Member</th>
                    <th className="th-cell">Item / Service</th>
                    <th className="th-cell">Notes</th>
                    <th className="th-cell text-right">Amount</th>
                    <th className="th-cell" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {hits.map((r) => {
                    const label = r.memberName || "Walk-in guest";
                    return (
                      <tr key={r.id} className="row-hover">
                        <td className="td-cell whitespace-nowrap font-medium text-gray-500">
                          {labelDate(r.reportDate)}
                        </td>
                        <td className="td-cell">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={label} />
                            <span className="font-semibold text-gray-900">{label}</span>
                            {r.memberId ? <Chip tone="green">Member</Chip> : null}
                          </div>
                        </td>
                        <td className="td-cell text-gray-600">{r.itemName || "—"}</td>
                        <td className="td-cell max-w-[14rem] truncate text-gray-500">{r.notes || "—"}</td>
                        <td className="td-cell text-right font-semibold text-gray-900">
                          {peso(r.amount)}
                        </td>
                        <td className="td-cell text-right">
                          <button
                            type="button"
                            onClick={() => jumpToDay({ id: r.reportId, date: r.reportDate })}
                            className="text-xs font-semibold text-green-600 transition hover:text-green-700"
                          >
                            View day
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      ) : null}

      {/* Closed days */}
      <Card>
        <CardHeader
          title="Closed daily sales"
          subtitle="Every time you close the day, its receipts are archived here."
        />

        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="space-y-4 px-5 py-5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : visibleReports.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title={dateFilter ? "Nothing closed on that day" : "Nothing closed yet"}
              message={
                dateFilter
                  ? "Pick another date, or clear the filter to see every closed day."
                  : "Close the day's sales on the Payments tab and every receipt will be archived here."
              }
              action={
                dateFilter ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters} className="mt-3">
                    Clear filters
                  </Button>
                ) : (
                  <Link
                    href="/dashboard/payments"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-on-accent shadow-sm transition hover:brightness-95"
                  >
                    Go to Payments
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )
              }
            />
          ) : (
            visibleReports.map((report) => {
              const expanded = openId === report.id;
              return (
                <div key={report.id}>
                  <button
                    type="button"
                    data-testid="report-row"
                    onClick={() => toggle(report.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                      <CalendarClock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">
                        {labelDate(report.date)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {report.transactionCount}{" "}
                        {report.transactionCount === 1 ? "transaction" : "transactions"} · closed{" "}
                        {formatTime(report.closedAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-gray-900">
                        {peso(report.totalSales)}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-gray-400">
                        Closed
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {expanded ? (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
                      {receiptsLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      ) : receipts && receipts.length === 0 ? (
                        <p className="py-4 text-center text-sm text-gray-500">
                          No receipts were recorded for this day.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[36rem] text-left">
                            <thead>
                              <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                                <th className="th-cell">Time</th>
                                <th className="th-cell">Customer / Member</th>
                                <th className="th-cell">Item / Service</th>
                                <th className="th-cell">Notes</th>
                                <th className="th-cell text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {(receipts || []).map((r) => {
                                const label = r.memberName || "Walk-in guest";
                                return (
                                  <tr key={r.id}>
                                    <td className="td-cell whitespace-nowrap font-medium text-gray-500">
                                      {formatTime(r.paidAt)}
                                    </td>
                                    <td className="td-cell">
                                      <div className="flex items-center gap-2.5">
                                        <Avatar name={label} />
                                        <span className="font-semibold text-gray-900">{label}</span>
                                        {r.memberId ? <Chip tone="green">Member</Chip> : null}
                                      </div>
                                    </td>
                                    <td className="td-cell text-gray-600">{r.itemName || "—"}</td>
                                    <td className="td-cell max-w-[14rem] truncate text-gray-500">
                                      {r.notes || "—"}
                                    </td>
                                    <td className="td-cell text-right font-semibold text-gray-900">
                                      {peso(r.amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
