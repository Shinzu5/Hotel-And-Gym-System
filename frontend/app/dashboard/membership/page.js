"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Dumbbell, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useStats } from "@/lib/useStats";
import { daysLeftFor, expirationFor, idOf, isMonthTerm, memberName, peso, planName, toDateInput } from "@/lib/format";
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Field,
  SelectInput,
  StatusPill,
  TableSkeleton,
  TextInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { useToasts } from "@/components/Toasts";

const todayISO = () => toDateInput(new Date());

/** "Oct 20, 2026" from a yyyy-mm-dd string, parsed in LOCAL time (no TZ drift). */
function formatLocalDate(iso) {
  if (!iso) return "—";
  const raw = String(iso).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysLeftOf(member) {
  if (typeof member?.daysLeft === "number") return member.daysLeft;
  if (!member?.endDate) return null;
  return daysLeftFor(member.endDate, undefined, isMonthTerm(member?.plan?.durationDays));
}

export default function MembershipPage() {
  const { push } = useToasts();
  const { refresh: refreshStats } = useStats();

  const [plans, setPlans] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add membership form
  const emptyForm = () => ({ fullName: "", startDate: todayISO(), planId: "", amount: "" });
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete confirmation
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [plansRes, membersRes] = await Promise.all([api.get("/plans"), api.get("/members")]);
      setPlans(Array.isArray(plansRes) ? plansRes : plansRes?.plans || []);
      setMembers(
        Array.isArray(membersRes) ? membersRes : membersRes?.members || []
      );
    } catch (err) {
      setError(err?.message || "Failed to load memberships.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedPlan = useMemo(
    () => plans.find((p) => idOf(p) === form.planId) || null,
    [plans, form.planId]
  );

  // The expiration is the first day the membership is over: a 30-day plan
  // starting Oct 20 expires Nov 20. Matches the backend exactly.
  const expiration = useMemo(
    () => (selectedPlan ? expirationFor(form.startDate, selectedPlan.durationDays) : null),
    [selectedPlan, form.startDate]
  );

  // Is this person already registered? The member list is already loaded on
  // this page, so the check is instant and free — no extra request.
  const duplicate = useMemo(() => {
    const q = form.fullName.trim().toLowerCase();
    if (!q) return null;
    const exact = members.find((m) => memberName(m).trim().toLowerCase() === q);
    if (exact) return { member: exact, exact: true };
    const partial = members.find((m) => memberName(m).trim().toLowerCase().includes(q));
    return partial ? { member: partial, exact: false } : null;
  }, [form.fullName, members]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handlePlanChange = (e) => {
    const planId = e.target.value;
    const plan = plans.find((p) => idOf(p) === planId) || null;
    setForm((f) => ({
      ...f,
      planId,
      // Auto-fill with the plan price, still editable afterwards.
      amount: plan && plan.price != null && plan.price !== "" ? String(plan.price) : f.amount,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const amount = Number(form.amount);
    if (!form.fullName.trim()) {
      setFormError("User name is required.");
      return;
    }
    if (!form.planId) {
      setFormError("Select a plan type.");
      return;
    }
    if (!form.startDate) {
      setFormError("Select a start date.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await api.post("/members", {
        fullName: form.fullName.trim(),
        planId: form.planId,
        startDate: form.startDate,
        amount,
      });
      push(`Membership added for ${form.fullName.trim()}.`, "success");
      setForm((f) => ({ ...emptyForm(), startDate: f.startDate, planId: f.planId, amount: f.amount }));
      await Promise.all([loadData(), refreshStats()]);
    } catch (err) {
      push(err?.message || "Failed to add membership.", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await api.del(`/members/${idOf(deleting)}`);
      push(`${memberName(deleting)}'s membership deleted.`, "success");
      setDeleting(null);
      await Promise.all([loadData(), refreshStats()]);
    } catch (err) {
      push(err?.message || "Failed to delete membership.", "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const busy = loading && members.length === 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display-heading text-2xl text-gray-900 sm:text-3xl">Membership</h1>
          <p className="mt-1 text-sm text-gray-500">
            Register a new gym user member. This creates the member record and one payment.
          </p>
        </div>
      </header>

      {/* Add membership */}
      <Card>
        <CardHeader
          icon={Dumbbell}
          title="Add Membership"
          subtitle="You're adding a new user. Fill in details and amount for now."
        />
        <form onSubmit={handleSubmit} className="px-5 py-5">
          {formError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {formError}
            </div>
          ) : null}

          {duplicate ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                {duplicate.exact ? "Already registered" : "Possible duplicate"}
              </p>
              <p className="mt-0.5 text-sm text-amber-800">
                <span className="font-semibold">{memberName(duplicate.member)}</span> is already
                a member
                {planName(duplicate.member?.plan)
                  ? ` on the ${planName(duplicate.member.plan)} plan`
                  : ""}
                {daysLeftOf(duplicate.member) != null
                  ? ` · ${daysLeftOf(duplicate.member)} days left`
                  : ""}
                . You can still add a membership (e.g. a family member with the same name).
              </p>
              <Link
                href="/dashboard/members"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline underline-offset-2"
              >
                Go to Members
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="User Name" htmlFor="mem-name">
              <TextInput
                id="mem-name"
                value={form.fullName}
                onChange={setField("fullName")}
                placeholder="Full name"
                autoComplete="off"
              />
            </Field>            <Field label="Start Date" htmlFor="mem-start">
              <TextInput
                id="mem-start"
                type="date"
                value={form.startDate}
                onChange={setField("startDate")}
              />
            </Field>
            <Field label="Plan Type" htmlFor="mem-plan">
              <SelectInput id="mem-plan" value={form.planId} onChange={handlePlanChange}>
                <option value="">Select plan</option>
                {plans.map((p) => (
                  <option key={idOf(p)} value={idOf(p)}>
                    {planName(p)} — {peso(p.price)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Amount" htmlFor="mem-amount">
              <TextInput
                id="mem-amount"
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
          </div>

          {/* Footer strip: live expiration + submit */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-green-600 shadow-sm">
                <Calendar className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Expiration
                </p>
                <p className="text-sm font-semibold text-gray-900" data-testid="membership-expiration">
                  {expiration ? formatLocalDate(expiration) : "—"}
                </p>
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" disabled={saving}>
              {saving ? "Adding…" : "Add Membership"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Registered memberships */}
      <Card className="px-0 py-0">
        <div className="card-header">
          <div>
            <h2 className="card-title">Registered Memberships</h2>
            <p className="card-subtitle">Live list of active memberships</p>
          </div>
          <Link
            href="/dashboard/members"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600 transition hover:text-green-700"
          >
            Manage in Members
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="th-cell">User Name</th>
                <th className="th-cell">Plan Type</th>
                <th className="th-cell th-cell-right">Amount</th>
                <th className="th-cell">Start Date</th>
                <th className="th-cell">Expiration</th>
                <th className="th-cell">Days Remaining</th>
                <th className="th-cell">Status</th>
                <th className="th-cell th-cell-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {busy ? (
                <tr>
                  <td colSpan={8}>
                    <TableSkeleton rows={5} cols={6} />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-red-600">{error}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={loadData}>
                      Try again
                    </Button>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Users}
                      title="No memberships yet"
                      message="Register the first member with the form above."
                    />
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const days = daysLeftOf(m);
                  const status = (m.status || "ACTIVE").toLowerCase();
                  return (
                    <tr key={idOf(m) || memberName(m)} className="row-hover">
                      <td className="td-cell">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={memberName(m)} />
                          <span className="font-semibold text-gray-900">{memberName(m)}</span>
                          <Chip tone="green">Member</Chip>
                        </div>
                      </td>
                      <td className="td-cell text-gray-600">{planName(m.plan || m.planName)}</td>
                      <td className="td-cell text-right font-semibold text-gray-900">
                        {peso(m.amountPaid ?? m.amount)}
                      </td>
                      <td className="td-cell text-gray-500">
                        {m.startDate ? formatLocalDate(m.startDate) : "—"}
                      </td>
                      <td className="td-cell text-gray-500">
                        {m.endDate ? formatLocalDate(m.endDate) : "—"}
                      </td>
                      <td className="td-cell">
                        <Chip tone={days != null && days <= 3 ? "amber" : "gray"}>
                          {days == null ? "—" : days > 0 ? `${days}d` : "0d"}
                        </Chip>
                      </td>
                      <td className="td-cell">
                        <StatusPill status={status} />
                      </td>
                      <td className="td-cell">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setDeleting(m)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
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

      {/* Delete confirmation */}
      <Modal
        open={!!deleting}
        onClose={() => {
          if (!deleteBusy) setDeleting(null);
        }}
        accent="danger"
        title="Delete this membership?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete membership"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <Avatar name={memberName(deleting || {})} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-semibold text-gray-900">
                {memberName(deleting || {})}
                <Chip tone="green">Member</Chip>
              </p>
              <p className="truncate text-xs text-gray-500">
                {planName(deleting?.plan || deleting?.planName) || "Membership"}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            The member record will be permanently removed. Payments already recorded stay in the
            payment history.
          </p>
        </div>
      </Modal>
    </div>
  );
}
