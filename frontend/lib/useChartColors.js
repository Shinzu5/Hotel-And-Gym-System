"use client";

import { useTheme } from "@/components/ThemeProvider";

/**
 * Chart colours for the current theme.
 *
 * SVG attributes do not reliably resolve `var(--x)` (gradient stops in
 * particular), so the charts take concrete colours instead.
 */
export function useChartColors() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return {
    line: dark ? "#4ade80" : "#16a34a",
    grid: dark ? "#334155" : "#f1f5f9",
    tick: dark ? "#94a3b8" : "#6b7280",
    cursor: dark ? "rgba(74, 222, 128, 0.08)" : "rgba(22, 163, 74, 0.06)",
    cursorStroke: dark ? "#475569" : "#e5e7eb",
  };
}
