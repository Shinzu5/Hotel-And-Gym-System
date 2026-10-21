"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search as SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useStats } from "@/lib/useStats";
import { formatDate, idOf, isMonthTerm, memberName, peso, planName, renewalExpiration, toDateInput } from "@/lib/format";
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  SearchInput,
  SelectInput,
  StatusPill,
  TableSkeleton,
  TextInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { useToasts } from "@/components/Toasts";

/* ------------------------------- shared clock ------------------------------ */
/* One interval for every countdown cell on screen. */

let clockSubscribers = new Set();
let clockTimer = null;

function subscribeClock(cb) {
  clockSubscribers.add(cb);
  if (!clockTimer && typeof window !== "undefined") {
    clockTimer = setInterval(() => {
      const tick = Date.now();
      clockSubscribers.forEach((fn) => fn(tick));
    }, 1000);
  }
  return () => {
    clockSubscribers.delete(cb);
    if (!clockSubscribers.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** null until mounted (keeps SSR and the first client render identical). */
function useTick() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    return subscribeClock(setNow);
  }, []);
  return now;
}

/**
 * The instant a membership stops being usable.
 *
 * A fixed-day term (15 days) expires on its LAST usable day, so it stays
 * active until that day is over. A month-length term (30 days) is over from
 * the moment its expiration date arrives.
 */
function usableUntil(value, monthTerm) {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return null;
  if (monthTerm) return t;
  const d = new Date(t);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function formatCountdown(ms) {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

/** Live ticking "24d 9h 17m 41s" — flips to "Expired" when time runs out. */
function TimeRemaining({ member }) {
  const now = useTick();
  const endMs = useMemo(
    () => usableUntil(member?.endDate, isMonthTerm(member?.plan?.durationDays)),
    [member?.endDate, member?.plan?.durationDays]
  );

  if (endMs == null) return <span className="pill bg-gray-100 text-gray-500">—</span>;
  if (now == null) return <span className="pill bg-gray-100 text-gray-400">…</span>;

  const remaining = endMs - now;
  if (remaining <= 0) {
    return <span className="pill bg-red-100 text-red-700">Expired</span>;
  }
  const urgent = remaining <= 3 * 86_400_000;
  return (
    <span
      className={`pill whitespace-nowrap font-mono ${
        urgent ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {formatCountdown(remaining)}
    </span>
  );
}

/* ---------------------------------- helpers -------------------------------- */

const FILTERS = ["all", "active", "expiring", "expired"];

function formatLocalDate(value) {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return formatDate(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MembersPage() {
  const { push } = useToasts();
  const { refresh: refreshStats } = useStats();

  const [filter, setFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [allMembers, setAllMembers] = useState([]); // renew picker
  const [plans, setPlans] = useState([]);

  // Renew modal
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewMemberId, setRenewMemberId] = useState("");
  const [renewPlanId, setRenewPlanId] = useState("");
  const [renewDays, setRenewDays] = useState("");
  const [renewAmount, setRenewAmount] = useState("");
  const [renewSaving, setRenewSaving] = useState(false);
  const [renewError, setRenewError] = useState("");

  /* ------------------------------ initial load ----------------------------- */

  useEffect(() => {
    // Support /dashboard/members?filter=expiring deep links.
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("filter")
        : null;
    if (fromUrl && FILTERS.includes(fromUrl)) setFilter(fromUrl);

    Promise.all([api.get("/members?filter=all"), api.get("/plans")])
      .then(([membersRes, plansRes]) => {
        setAllMembers(
          Array.isArray(membersRes) ? membersRes : membersRes?.members || []
        );
        setPlans(Array.isArray(plansRes) ? plansRes : plansRes?.plans || []);
      })
      .catch(() => {
        /* the main table surfaces its own errors */
      });
  }, []);

  /* ------------------------------ debounced q ------------------------------ */

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* ------------------------------- table query ----------------------------- */

  const loadRows = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter && filter !== "all") params.set("filter", filter);
      if (search) params.set("q", search);
      const qs = params.toString();
      const res = await api.get(`/members${qs ? `?${qs}` : ""}`);
      if (Array.isArray(res)) setData({ counts: null, members: res || [] });
      else setData({ counts: res?.counts || null, members: res?.members || [] });
      return res;
    } catch (err) {
      setError(err?.message || "Failed to load members.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const counts = data?.counts || {};
  const rows = data?.members || [];
  const busy = loading && !data;

  const refreshAll = () =>
    Promise.all([
      loadRows(),
      api
        .get("/members?filter=all")
        .then((res) => setAllMembers(Array.isArray(res) ? res : res?.members || []))
        .catch(() => {}),
      refreshStats(),
    ]);

  /* -------------------------------- renew --------------------------------- */

  const openRenew = (member = null) => {
    setRenewError("");
    setRenewSaving(false);
    if (member) {
      const plan =
        plans.find((p) => idOf(p) === idOf(member.plan)) ||
        plans.find((p) => planName(p) === planName(member.plan || {})) ||
        null;
      setRenewMemberId(idOf(member));
      setRenewPlanId(plan ? idOf(plan) : idOf(member.plan) || "");
      setRenewDays(
        member.plan?.durationDays ?? plan?.durationDays ?? ""
      );
      setRenewAmount(plan?.price != null ? String(plan.price) : member.amountPaid != null ? String(member.amountPaid) : "");
    } else {
      setRenewMemberId("");
      setRenewPlanId("");
      setRenewDays("");
      setRenewAmount("");
    }
    setRenewOpen(true);
  };

  const renewMember = useMemo(
    () => allMembers.find((m) => idOf(m) === renewMemberId) || null,
    [allMembers, renewMemberId]
  );
  const renewPlan = useMemo(
    () => plans.find((p) => idOf(p) === renewPlanId) || null,
    [plans, renewPlanId]
  );

  const handleRenewMemberChange = (e) => {
    const memberId = e.target.value;
    setRenewMemberId(memberId);
    const member = allMembers.find((m) => idOf(m) === memberId);
    const plan = member ? plans.find((p) => idOf(p) === idOf(member.plan)) : null;
    if (plan) {
      setRenewPlanId(idOf(plan));
      setRenewDays(plan.durationDays ?? "");
      setRenewAmount(plan.price != null ? String(plan.price) : "");
    }
  };

  const handleRenewPlanChange = (e) => {
    const planId = e.target.value;
    setRenewPlanId(planId);
    const plan = plans.find((p) => idOf(p) === planId);
    if (plan) {
      setRenewDays(plan.durationDays ?? "");
      setRenewAmount(plan.price != null ? String(plan.price) : "");
    }
  };

  const currentExpiration = renewMember?.endDate || null;
  // Matches the backend: a live membership gains the days on top of what is
  // left, an expired one restarts from tomorrow.
  const newExpiration = useMemo(() => {
    const days = Number(renewDays);
    if (!renewMember || !Number.isFinite(days) || days <= 0) return null;
    return renewalExpiration(currentExpiration, days);
  }, [renewMember, currentExpiration, renewDays]);

  const submitRenew = async (e) => {
    e.preventDefault();
    if (renewSaving) return;
    const days = Number(renewDays);
    const amount = Number(renewAmount);
    if (!renewMemberId) {
      setRenewError("Select a member.");
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      setRenewError("Days must be at least 1.");
      return;
    }
    if (renewAmount === "" || !Number.isFinite(amount) || amount < 0) {
      setRenewError("Enter a valid amount.");
      return;
    }

    setRenewSaving(true);
    setRenewError("");
    try {
      const result = await api.post(`/members/${renewMemberId}/renew`, {
        planId: renewPlanId || undefined,
        days,
        amount,
      });
      push(
        result?.newExpiration
          ? `Renewed — new expiration ${formatLocalDate(result.newExpiration)}.`
          : "Membership renewed.",
        "success"
      );
      setRenewOpen(false);
      await refreshAll();
    } catch (err) {
      setRenewError(err?.message || "Failed to renew membership.");
    } finally {
      setRenewSaving(false);
    }
  };

  /* -------------------------------- render --------------------------------- */

  const tabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "expiring", label: "Expiring soon", count: counts.expiring },
    { key: "expired", label: "Expired", count: counts.expired },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display-heading text-2xl text-gray-900 sm:text-3xl">Members</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track registered gym members, renewals, and remaining days.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => openRenew(null)}>
          <RefreshCw className="h-4 w-4" />
          Renew
        </Button>
      </header>

      {/* Registered memberships */}
      <Card className="px-0 py-0">
        <div className="card-header">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="card-title">Registered Memberships</h2>
              <p className="card-subtitle">Members, renewals and time remaining</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === tab.key
                      ? "bg-green-600 text-on-accent shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                  {typeof tab.count === "number" ? ` ${tab.count}` : ""}
                </button>
              ))}
            </div>
          </div>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search name, contact, or plan type"
            className="w-full sm:w-72"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-cell">User Name</th>
                <th className="th-cell">Plan Type</th>
                <th className="th-cell th-cell-right">Amount Paid</th>
                <th className="th-cell">Registered</th>
                <th className="th-cell">Start Date</th>
                <th className="th-cell">Expiration / Renewal</th>
                <th className="th-cell">Time Remaining</th>
                <th className="th-cell">Status</th>
                <th className="th-cell th-cell-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {busy ? (
                <tr>
                  <td colSpan={9}>
                    <TableSkeleton rows={6} cols={6} />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-red-600">{error}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={loadRows}>
                      Try again
                    </Button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={SearchIcon}
                      title="No members found"
                      message={
                        search || filter !== "all"
                          ? "Try another filter or search term."
                          : "Register your first member from the Membership tab."
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((m) => {
                  const name = memberName(m);
                  return (
                    <tr key={idOf(m) || name} className="row-hover">
                      <td className="td-cell">
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-semibold text-gray-900">
                              {name}
                              <Chip tone="green">Member</Chip>
                            </p>
                            <p className="truncate text-xs text-gray-400">{m.phone || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="td-cell text-gray-600">{planName(m.plan || m.planName)}</td>
                      <td className="td-cell text-right font-semibold text-gray-900">
                        {peso(m.amountPaid)}
                      </td>
                      <td className="td-cell text-gray-500">{formatDate(m.createdAt)}</td>
                      <td className="td-cell text-gray-500">{formatLocalDate(m.startDate)}</td>
                      <td className="td-cell text-gray-500">{formatLocalDate(m.endDate)}</td>
                      <td className="td-cell">
                        <TimeRemaining member={m} />
                      </td>
                      <td className="td-cell">
                        <StatusPill status={(m.status || "ACTIVE").toLowerCase()} />
                      </td>
                      <td className="td-cell">
                        <div className="flex justify-end">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openRenew(m)}
                            className="gap-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Renew
                          </Button>
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

      {/* Renew membership */}
      <Modal
        open={renewOpen}
        onClose={() => {
          if (!renewSaving) setRenewOpen(false);
        }}
        title="Renew membership"
        subtitle="The renewal is added on top of any remaining days and recorded as a payment."
        width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewOpen(false)} disabled={renewSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="renew-form"
              disabled={renewSaving}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${renewSaving ? "animate-spin" : ""}`} />
              {renewSaving ? "Renewing…" : "Renew"}
            </Button>
          </>
        }
      >
        <form id="renew-form" onSubmit={submitRenew} className="space-y-4">
          {renewError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {renewError}
            </div>
          ) : null}

          <Field label="Member" htmlFor="renew-member">
            <SelectInput
              id="renew-member"
              value={renewMemberId}
              onChange={handleRenewMemberChange}
              required
            >
              <option value="">Select member</option>
              {allMembers.map((m) => (
                <option key={idOf(m)} value={idOf(m)}>
                  {memberName(m)} {m.phone ? `— ${m.phone}` : ""}
                </option>
              ))}
            </SelectInput>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Plan Type" htmlFor="renew-plan" className="sm:col-span-1">
              <SelectInput id="renew-plan" value={renewPlanId} onChange={handleRenewPlanChange}>
                <option value="">Select plan</option>
                {plans.map((p) => (
                  <option key={idOf(p)} value={idOf(p)}>
                    {planName(p)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Days" htmlFor="renew-days">
              <TextInput
                id="renew-days"
                type="number"
                min="1"
                step="1"
                value={renewDays}
                onChange={(e) => setRenewDays(e.target.value)}
                placeholder="30"
              />
            </Field>
            <Field label="Amount" htmlFor="renew-amount">
              <TextInput
                id="renew-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                prefix="₱"
                value={renewAmount}
                onChange={(e) => setRenewAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
          </div>

          {/* Expiration math */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Current expiration
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {formatLocalDate(currentExpiration)}
              </p>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-green-600">
                New after renewal
              </p>
              <p className="mt-1 text-sm font-semibold text-green-800">
                {newExpiration ? formatLocalDate(newExpiration) : "—"}
              </p>
            </div>
          </div>

          {!renewPlan ? (
            <p className="text-xs text-gray-400">
              Pick a plan to auto-fill days and amount — both stay editable.
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
