"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

/**
 * The light / night toggle.
 *
 * `variant="icon"` is the round button for the top bar; `variant="ghost"` is
 * the text button for the login card.
 */
export default function ThemeToggle({ variant = "icon", className = "" }) {
  const { theme, mounted, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  // The server cannot know the theme, so render a neutral icon until mounted.
  const Icon = !mounted ? Sun : isDark ? Sun : Moon;
  const label = !mounted
    ? "Switch theme"
    : isDark
      ? "Switch to light mode"
      : "Switch to night mode";

  if (variant === "ghost") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-on-accent/80 transition hover:bg-white/15 hover:text-on-accent ${className}`}
      >
        <Icon className="h-4 w-4" />
        {isDark ? "Light" : "Night"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-800 ${className}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
