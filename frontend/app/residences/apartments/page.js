"use client";

import { useState } from "react";
import { Building2, Pencil, Plus, Wallet, XCircle } from "lucide-react";
import { useResidences } from "@/lib/useResidences";
import { useToasts } from "@/components/Toasts";
import { formatDate, peso } from "@/lib/format";
import { Avatar, Button, Card, EmptyState, ErrorState, Skeleton, StatusPill } from "@/components/ui";
import { EndLeaseModal, LeaseModal } from "@/components/residences/modals";

const pillLabel = (pill) => (pill === "EXPIRING" ? "Expiring soon" : pill);

const MS_DAY = 24 * 60 * 60 * 1000;

/** Share of the lease still ahead of the tenant (drives the green bar). */
function remainingPercent(lease) {
  if (!lease) return 0;
  const total = new Date(lease.endDate).getTime() - new Date(lease.startDate).getTime();
  if (total <= 0) return 0;
  return Math.min(100, Math.max(4, (lease.timeRemainingMs / total) * 100));
}

function Kpi({ label, value, dot = false }) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center gap-2">
        {dot ? <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" /> : null}
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      </div>
      <p className="display-heading mt-2 text-2xl text-gray-900">{value}</p>
    </Card>
  );
}

export default function ApartmentsPage() {
  const { stats, loading, error, refresh } = useResidences();
  const { push } = useToasts();

  const [leaseTarget, setLeaseTarget] = useState(null);
  const [endTarget, setEndTarget] = useState(null);

  const busy = loading && !stats;
  const summary = stats?.summary;
  const units = stats?.units || [];

  const saved = (message, type = "success") => {
    push(message, type);
    refresh();
  };

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
      <header>
        <h1 className="display-heading text-2xl text-gray-900 sm:text-3xl">Apartments</h1>
        <p className="mt-1 text-sm text-gray-500">
          {busy
            ? "Loading your units…"
            : `${summary?.occupied ?? 0} of ${summary?.total ?? 0} units occupied. Track occupancy and earnings for each unit.`}
        </p>
      </header>

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-3">
        {busy ? (
          <>
            <Card className="px-5 py-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-36" />
            </Card>
            <Card className="px-5 py-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-36" />
            </Card>
            <Card className="px-5 py-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-36" />
            </Card>
          </>
        ) : (
          <>
            <Kpi label="Total earned" value={peso(summary?.totalEarned)} dot />
            <Kpi label="Occupied" value={`${summary?.occupied ?? 0} of ${summary?.total ?? 0} units`} />
            <Kpi label="Monthly rent roll" value={peso(summary?.monthlyRentRoll)} />
          </>
        )}
      </section>

      {/* Unit cards */}
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {busy ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-5 h-12 w-full" />
                <Skeleton className="mt-5 h-16 w-full" />
                <Skeleton className="mt-5 h-10 w-full" />
              </Card>
            ))}
          </>
        ) : units.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <Card>
              <EmptyState
                icon={Building2}
                title="No apartments yet"
                message="Add your first unit to begin tracking occupancy and rental income."
              />
            </Card>
          </div>
        ) : (
          units.map((unit) =>
            unit.lease ? (
              /* ------------------------------ Occupied ----------------------------- */
              <Card key={unit.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {unit.code}
                  </p>
                  <StatusPill status={pillLabel(unit.pill)} />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Avatar name={unit.lease.renterName} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">
                      {unit.lease.renterName}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {unit.lease.contact || "No contact on file"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Start date
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {formatDate(unit.lease.startDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Expiration date
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {formatDate(unit.lease.endDate)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500">
                    {Math.max(0, unit.lease.daysLeft)} days still on lease
                  </p>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-green-600 transition-all duration-500"
                      style={{ width: `${remainingPercent(unit.lease)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-auto pt-5">
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Total paid
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-gray-900">
                      {peso(unit.totalEarned)}
                    </p>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLeaseTarget({ unit, lease: unit.lease })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit lease
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setEndTarget({ unit, lease: unit.lease })}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      End
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              /* ------------------------------ Vacant ------------------------------- */
              <Card key={unit.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {unit.code}
                  </p>
                  <StatusPill status="Vacant" />
                </div>

                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-900">No renter yet</p>
                  <p className="text-xs text-gray-500">
                    {unit.vacantLabel === "Available today"
                      ? "Available today"
                      : `Unit vacant for ${unit.vacantLabel}`}
                  </p>
                </div>

                <Button
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => setLeaseTarget({ unit, lease: null })}
                >
                  <Plus className="h-4 w-4" />
                  Add renter
                </Button>

                <div className="mt-auto border-t border-gray-100 pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Total earned
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">
                    {peso(unit.totalEarned)}
                  </p>
                </div>
              </Card>
            )
          )
        )}
      </section>

      {/* ------------------------------- Modals ------------------------------- */}
      <LeaseModal
        open={!!leaseTarget}
        unit={leaseTarget?.unit || null}
        lease={leaseTarget?.lease || null}
        onClose={() => setLeaseTarget(null)}
        onSaved={() => saved(leaseTarget?.lease ? "Lease updated." : "Renter added.")}
      />

      <EndLeaseModal
        open={!!endTarget}
        unit={endTarget?.unit || null}
        lease={endTarget?.lease || null}
        onClose={() => setEndTarget(null)}
        onEnded={() => saved("Lease ended. The unit is now vacant.")}
      />
    </div>
  );
}
