"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, KeyRound, Wallet } from "lucide-react";
import { useResidences } from "@/lib/useResidences";
import { formatDate, peso } from "@/lib/format";
import { Avatar, Card, EmptyState, ErrorState, Skeleton, StatusPill } from "@/components/ui";
import RentalChart from "@/components/RentalChart";

/** Static pill label — "Expiring soon" rather than the bare status key. */
const pillLabel = (pill) => (pill === "EXPIRING" ? "Expiring soon" : pill);

function StatTile({ label, value, sub, icon: Icon }) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        {Icon ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p className="display-heading mt-2 text-2xl text-gray-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </Card>
  );
}

export default function ResidencesOverviewPage() {
  const { stats, loading, error, refresh } = useResidences();

  // Server and first client paint must agree — the date only mounts client-side.
  const [today, setToday] = useState(null);
  useEffect(() => {
    setToday(formatDate(new Date()));
  }, []);

  const busy = loading && !stats;
  const summary = stats?.summary;
  const series = stats?.incomeSeries || [];
  const earnings = stats?.earningsByUnit || [];
  const expirations = stats?.upcomingExpirations || [];

  if (error && !stats) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display-heading text-2xl text-gray-900 sm:text-3xl">
            Apartments overview
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Apartments analytics{today ? ` · ${today}` : ""}
          </p>
        </div>
        <Link
          href="/residences/apartments"
          className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-green-600 transition hover:text-green-700"
        >
          Manage apartments
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* Total earned + income chart | KPI tiles */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500">Total earned from rentals</p>
            <span className="pill bg-green-100 text-green-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-600" />
              Live
            </span>
          </div>

          <div className="display-heading mt-2 text-3xl text-gray-900 sm:text-4xl">
            {busy ? <Skeleton className="h-9 w-48" /> : peso(summary?.totalEarned)}
          </div>

          <p className="mt-6 text-sm font-semibold text-gray-700">Rental income · Jan–Dec</p>
          <div className="mt-3">
            {busy ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <RentalChart data={series} />
            )}
          </div>
        </Card>

        <div className="grid content-start gap-4">
          {busy ? (
            <>
              <Card className="px-5 py-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-7 w-20" />
              </Card>
              <Card className="px-5 py-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-7 w-32" />
              </Card>
              <Card className="px-5 py-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-7 w-28" />
              </Card>
              <Card className="px-5 py-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-7 w-20" />
              </Card>
            </>
          ) : (
            <>
              <StatTile
                label="Occupancy"
                icon={Building2}
                value={`${summary?.occupancyPercent ?? 0}%`}
                sub={`${summary?.occupied ?? 0} of ${summary?.total ?? 0} units rented`}
              />
              <StatTile
                label="Monthly rent roll"
                icon={Wallet}
                value={peso(summary?.monthlyRentRoll)}
                sub="from active leases"
              />
              <StatTile
                label="Earned this month"
                icon={KeyRound}
                value={peso(summary?.earnedThisMonth)}
                sub={`${summary?.daysLeftInMonth ?? 0}d left, prorated daily`}
              />
              <StatTile
                label="Vacant units"
                icon={CalendarClock}
                value={String(summary?.vacantUnits ?? 0)}
                sub="Ready to rent"
              />
            </>
          )}
        </div>
      </section>

      {/* Earnings by apartment | Upcoming lease expirations */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="card-header">
            <div>
              <h2 className="card-title">Earnings by apartment</h2>
              <p className="card-subtitle">All-time, including past renters</p>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            {busy ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : earnings.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No apartments yet"
                message="Add your first unit to start tracking rental income."
              />
            ) : (
              earnings.map((item) => (
                <div key={item.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800">
                      {item.name}
                      <span className="text-gray-400"> · {item.type}</span>
                    </p>
                    <p className="text-sm font-bold text-gray-900">{peso(item.amount)}</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-green-600 transition-all duration-500"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="card-header">
            <div>
              <h2 className="card-title">Upcoming lease expirations</h2>
              <p className="card-subtitle">Reach out to renters before their lease ends</p>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {busy ? (
              <div className="space-y-4 px-5 py-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : expirations.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No active leases"
                message="Rent out a vacant unit and its lease will show up here."
                action={
                  <Link
                    href="/residences/apartments"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-on-accent shadow-sm transition hover:brightness-95"
                  >
                    Manage apartments
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                }
              />
            ) : (
              expirations.map((row) => (
                <div key={row.leaseId} className="flex items-center gap-3 px-5 py-4">
                  <Avatar
                    name={row.renterName}
                    tone={row.pill === "EXPIRING" ? "amber" : "green"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{row.renterName}</p>
                    <p className="truncate text-xs text-gray-500">
                      {row.unitName} · ends {formatDate(row.endDate)} · {row.daysLeft} days left
                    </p>
                  </div>
                  <StatusPill status={pillLabel(row.pill)} />
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
