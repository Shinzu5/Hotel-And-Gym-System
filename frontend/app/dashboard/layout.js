"use client";

import Shell from "@/components/Shell";

const TITLES = [
  { href: "/dashboard/payments", title: "Payments" },
  { href: "/dashboard/reports", title: "Reports" },
  { href: "/dashboard/membership", title: "Membership" },
  { href: "/dashboard/members", title: "Members" },
];

export default function DashboardLayout({ children }) {
  return (
    <Shell titles={TITLES} fallbackTitle="Dashboard">
      {children}
    </Shell>
  );
}
