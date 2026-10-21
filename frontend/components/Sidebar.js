"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  Dumbbell,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import { clearToken } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { useStats } from "@/lib/useStats";
import { useResidences } from "@/lib/useResidences";
import { pesoLabel } from "@/lib/format";
import { BuildingMark, GymMark } from "./Logo";

/* ------------------------------- Nav config ------------------------------- */

const GYM_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, badge: "1" },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/membership", label: "Membership", icon: Dumbbell },
  { href: "/dashboard/members", label: "Members", icon: Users },
];

const RESIDENCES_NAV = [
  { href: "/residences", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/residences/apartments", label: "Apartments", icon: Building2 },
];

const BRANDS = {
  gym: { name: "Fitness Gym" },
  residences: { name: "Apartments" },
};

/**
 * One sidebar, two businesses.
 *
 * Which side you are on is derived from the URL (`/residences/*` vs
 * `/dashboard/*`) instead of component state, so the brand, the nav list and
 * the Fitness Gym/Apartments pill can never drift out of sync with the page
 * you are on.
 */
export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-200 bg-white lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-2xl">
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function SidebarContent({ onNavigate }) {
  const pathname = usePathname();
  const router = useRouter();

  const isResidences = pathname.startsWith("/residences");
  const business = isResidences ? "residences" : "gym";

  // Only the side you are on loads its numbers.
  const { stats } = useStats();
  const { stats: residences } = useResidences({ enabled: isResidences });

  const nav = isResidences ? RESIDENCES_NAV : GYM_NAV;
  const brand = BRANDS[business];
  const Mark = isResidences ? BuildingMark : GymMark;

  const switchBusiness = (value) => {
    const alreadyThere = value === business;
    onNavigate?.();
    if (alreadyThere) return;
    router.push(value === "residences" ? "/residences" : "/dashboard");
  };

  const handleLogout = () => {
    disconnectSocket();
    clearToken();
    router.push("/login");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <Mark size={38} />
        <span className="text-lg font-bold tracking-tight text-gray-900">{brand.name}</span>
      </div>

      <div className="mx-5 border-t border-gray-100" />

      {/* Context line — live paid-today for the gym, live unit count for rentals */}
      <p className="px-5 py-2.5 text-[11px] font-medium text-gray-500">
        {isResidences ? (
          <>
            <span className="font-semibold text-gray-700">
              {residences ? residences.summary?.total ?? "—" : "—"}
            </span>{" "}
            apartments live
          </>
        ) : (
          <>
            {stats ? (
              <span className="font-semibold text-gray-700">{pesoLabel(stats.paidToday)}</span>
            ) : (
              "PHP —"
            )}{" "}
            paid today
          </>
        )}
      </p>

      {/* Business switcher */}
      <div className="px-5 pb-4 pt-1">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Switch business
        </p>
        <div className="relative flex rounded-full bg-gray-100 p-1">
          <button
            type="button"
            aria-pressed={business === "gym"}
            onClick={() => switchBusiness("gym")}
            className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition ${
              business === "gym"
                ? "bg-green-600 text-on-accent shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Fitness Gym
          </button>
          <button
            type="button"
            aria-pressed={business === "residences"}
            onClick={() => switchBusiness("residences")}
            className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition ${
              business === "residences"
                ? "bg-green-600 text-on-accent shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Apartments
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-green-50 text-green-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${active ? "text-green-600" : "text-gray-400"}`} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-on-accent">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-gray-100 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Logout
        </button>
      </div>
    </div>
  );
}
