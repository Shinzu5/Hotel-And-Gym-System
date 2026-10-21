"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  Clock,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { useStats } from "@/lib/useStats";
import {
  formatDate,
  greetingForHour,
  idOf,
  memberName,
  peso,
  pesoWhole,
  planName,
} from "@/lib/format";
import { Avatar, Button, Card, Chip, ErrorState, Skeleton, StatusPill } from "@/components/ui";
import RevenueChart from "@/components/RevenueChart";

/**
 * Wall-clock time, deliberately `null` on the server AND on the first client
 * render so server and client markup always agree (a time-based greeting would
 * otherwise throw a hydration mismatch whenever the two clocks straddle a
 * day/period boundary or a timezone difference). The real clock mounts after.
 */
function useNow() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function DashboardPage() {
  const now = useNow();
  const { stats, loading, error, refresh } = useStats();

  const busy = loading && !stats;
  const skeleton = (
    <Card className="flex flex-col gap-3 px-5 py-4">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3.5 w-40" />
    </Card>
  );

  if (error && !stats) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card className="px-5 py-4">
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      </div>
    );
  }

  const growth = stats?.growthPercent;
  const growthText =
    growth == null || Number.isNaN(Number(growth))
      ? null
      : `${Number(growth) >= 0 ? "+" : ""}${Number(growth).toFixed(1)}% vs ${
          stats.prevMonthLabel || "previous month"
        }`;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display-heading text-2xl text-gray-900 sm:text-3xl">
            {/* `now` is null on the server and first paint -> identical markup on
                both sides. The time-aware greeting mounts right after. */}
            {now ? `${greetingForHour(now.getHours())}, Admin` : "Hello, Admin"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Here&apos;s how Fitness Gym is doing{now ? ` · ${formatDate(now)}` : ""}
          </p>
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {busy ? (
          <>
            {skeleton}
            {skeleton}
            {skeleton}
            {skeleton}
            {skeleton}
          </>
        ) : (
          <>
            <StatCard
              label="Today's Sales"
              value={peso(stats?.todaySales)}
              icon={DollarSign}
              tone="green"
              delta={`${peso(stats?.openSales || 0)} still open`}
            />
            <StatCard
              label="Today's Transactions"
              value={stats?.todayTransactions ?? 0}
              icon={CreditCard}
              tone="blue"
              delta={`${stats?.openTransactions ?? 0} open · rest closed`}
            />
            <StatCard
              label="Active Members"
              value={stats?.activeMembers ?? 0}
              icon={Users}
              tone="green"
              delta={`${(stats?.expiringSoon || []).length} expiring soon`}
            />
            <StatCard
              label="Expired Members"
              value={stats?.expiredMembers ?? 0}
              icon={Clock}
              tone="amber"
              delta="Awaiting renewal"
              deltaTone="amber"
            />
            <StatCard
              label="Active Membership Plans"
              value={stats?.activePlans ?? 0}
              icon={LayoutDashboard}
              tone="violet"
              delta="Available at signup"
            />
          </>
        )}
      </section>

      {/* Middle row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue card */}
        <Card className="flex flex-col gap-5 px-5 py-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="card-title">Revenue this month</h2>
              <div className="mt-1 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {busy ? <Skeleton className="h-10 w-48" /> : pesoWhole(stats?.monthRevenue)}
              </div>
              {stats?.monthLabel ? (
                <p className="mt-1 text-xs text-gray-400">{stats.monthLabel} to date</p>
              ) : null}
            </div>
            <Chip tone="green" className="py-1.5">
              <ArrowRight className="-rotate-45 h-3.5 w-3.5" />
              {busy ? "—" : growthText || "No comparison yet"}
            </Chip>
          </div>
          {busy ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <RevenueChart data={stats?.revenueSeries || []} />
          )}
        </Card>

        {/* Expiring soon */}
        <Card className="flex flex-col px-0 py-0">
          <div className="card-header">
            <div>
              <h2 className="card-title">Expiring soon</h2>
              <p className="card-subtitle">Members whose plans are ending shortly</p>
            </div>
            <Link
              href="/dashboard/members?filter=expiring"
              className="text-sm font-semibold text-green-600 hover:text-green-700"
            >
              View all
            </Link>
          </div>
          <div className="flex flex-1 flex-col divide-y divide-gray-100">
            {busy ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))
            ) : (stats?.expiringSoon || []).length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 py-8 text-center">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-gray-900">No upcoming expirations</p>
                  <p className="text-sm text-gray-500">Everything looks on track.</p>
                </div>
              </div>
            ) : (
              (stats?.expiringSoon || []).slice(0, 5).map((item) => {
                const days = Number(item.daysLeft ?? 0);
                const urgent = days <= 3;
                return (
                  <div
                    key={idOf(item) || `${item.name}-${item.endDate}`}
                    className="flex items-center gap-3 px-5 py-3.5"
                  >
                    <Avatar name={item.name || "Member"} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-gray-900">
                        {item.name || "Unnamed member"}
                        <Chip tone="green">Member</Chip>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {planName(item.plan || item.planName)} ·{" "}
                        {days === 1 ? "in 1 day" : `in ${days} days`}
                      </p>
                    </div>
                    <Chip tone={urgent ? "amber" : "gray"}>{days}d</Chip>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Recent payments */}
      <Card className="flex flex-col px-0 py-0">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recent payments</h2>
            <p className="card-subtitle">Latest transactions recorded in the system</p>
          </div>
          <Link href="/dashboard/payments">
            <Button variant="secondary" size="sm" className="gap-1.5">
              View all
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-cell">Member</th>
                <th className="th-cell">Plan</th>
                <th className="th-cell">Item / Service</th>
                <th className="th-cell">Date</th>
                <th className="th-cell th-cell-right">Amount</th>
                <th className="th-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {busy ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="td-cell">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </td>
                    <td className="td-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="td-cell">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="td-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="td-cell">
                      <div className="flex justify-end">
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </td>
                    <td className="td-cell">
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : (stats?.recentPayments || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-gray-900">No payments yet</p>
                    <p className="mt-1 text-sm text-gray-500">Record a payment to see it here.</p>
                  </td>
                </tr>
              ) : (
                (stats?.recentPayments || []).map((payment) => {
                  const memberLabel = payment.memberName || memberName(payment.member || {});
                  const planLabel = payment.planName || planName(payment.plan || {});
                  const paidAt = payment.paidAt || payment.date || payment.createdAt;
                  return (
                    <tr
                      key={idOf(payment) || `${memberLabel}-${paidAt}`}
                      className="row-hover"
                    >
                      <td className="td-cell">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={memberLabel} />
                          <span className="font-semibold text-gray-900">{memberLabel}</span>
                          {payment.memberId ? <Chip tone="green">Member</Chip> : null}
                        </div>
                      </td>
                      <td className="td-cell text-gray-600">{planLabel}</td>
                      <td className="td-cell text-gray-600">{payment.itemName || "—"}</td>
                      <td className="td-cell text-gray-500">{formatDate(paidAt)}</td>
                      <td className="td-cell text-right font-semibold text-gray-900">
                        {peso(payment.amount)}
                      </td>
                      <td className="td-cell">
                        <StatusPill status={payment.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "green", delta, deltaTone }) {
  const toneMap = {
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
    amber: "bg-amber-100 text-amber-600",
    violet: "bg-violet-100 text-violet-600",
    red: "bg-red-100 text-red-600",
  };

  return (
    <Card className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500">{label}</p>
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            toneMap[tone] || toneMap.green
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {/* The value gets the full card width — on its own row it fits
          "₱1,950.00" without truncating next to the icon. */}
      <p className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
        {value}
      </p>
      {delta ? (
        <p
          className={`flex items-center gap-1.5 text-xs ${
            deltaTone === "amber" ? "text-amber-600" : "text-gray-500"
          }`}
        >
          {deltaTone === "amber" ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
          {delta}
        </p>
      ) : null}
    </Card>
  );
}
