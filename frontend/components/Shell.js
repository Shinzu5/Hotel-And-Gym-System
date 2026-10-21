"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, Menu, X } from "lucide-react";
import { getToken } from "@/lib/api";
import { useNotifications } from "@/lib/useNotifications";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";

const KIND_DOT = {
  success: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

/**
 * The authenticated app shell — sidebar + sticky topbar + notifications bell.
 *
 * Shared by `/dashboard/*` (Fitness Gym) and `/residences/*` (Apartments).
 * Only the page-title map differs, so it is passed in as a prop
 * rather than duplicated per route tree.
 */
export default function Shell({ titles = [], fallbackTitle = "Dashboard", children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const { items, unread, markAllRead } = useNotifications();

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    setMenuOpen(false);
    setBellOpen(false);
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  const match = titles.find(
    (entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`)
  );
  const pageTitle = match ? match.title : fallbackTitle;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-gray-50/85 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition hover:bg-gray-50 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="display-heading truncate text-lg text-gray-900">{pageTitle}</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Notifications bell */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Notifications"
                  aria-expanded={bellOpen}
                  onClick={() => setBellOpen((open) => !open)}
                  className="relative rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-800"
                >
                  <Bell className="h-5 w-5" />
                  {unread > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-on-accent ring-2 ring-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </button>

                {bellOpen ? (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setBellOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white shadow-pop">
                      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">Notifications</p>
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 transition hover:text-green-700"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Mark all read
                        </button>
                      </div>

                      <div className="max-h-80 overflow-y-auto">
                        {items.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <p className="text-sm font-semibold text-gray-900">No notifications yet</p>
                            <p className="mt-1 text-sm text-gray-500">
                              Realtime updates will show up here.
                            </p>
                          </div>
                        ) : (
                          <ul className="divide-y divide-gray-100">
                            {items.map((item) => (
                              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                                <span
                                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                    KIND_DOT[item.kind] || KIND_DOT.info
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-gray-900">
                                    {item.title}
                                  </p>
                                  {item.body ? (
                                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                                      {item.body}
                                    </p>
                                  ) : null}
                                </div>
                                <span className="shrink-0 text-[11px] text-gray-400">
                                  {new Date(item.at).toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Light / night mode */}
              <ThemeToggle />

              {/* Admin chip */}
              <div className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3.5 shadow-sm">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-on-accent">
                  A
                </span>
                <span className="text-sm font-semibold text-gray-800">Admin</span>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
