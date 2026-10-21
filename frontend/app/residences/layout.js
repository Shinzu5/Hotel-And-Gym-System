"use client";

import Shell from "@/components/Shell";

const TITLES = [{ href: "/residences/apartments", title: "Apartments" }];

export default function ResidencesLayout({ children }) {
  return (
    <Shell titles={TITLES} fallbackTitle="Apartments Dashboard">
      {children}
    </Shell>
  );
}
