"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, ShieldAlert } from "lucide-react";
import { login, getToken } from "@/lib/api";
import { GymMark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      // Token persisted by login; keepSignedIn is UX only here.
      router.push("/dashboard");
    } catch (err) {
      setError(err?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10 lg:px-8">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-on-accent/5 blur-3xl" />
      {/* Light / night mode, above the sign-in card. */}
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle variant="ghost" />
      </div>
      <main className="relative z-10 grid w-full max-w-6xl items-center gap-10 rounded-3xl lg:grid-cols-5 lg:gap-14">
        {/* Left column */}
        <section className="col-span-2 hidden flex-col items-center justify-center text-center lg:flex">
          <div className="relative">
            <div className="absolute -inset-6 rounded-full bg-emerald-400/20 blur-2xl" />
            <div className="relative flex flex-col items-center">
              <div className="mb-6 rounded-full bg-on-accent p-3 shadow-2xl ring-2 ring-on-accent/40">
                <GymMark size={150} />
              </div>
              <h1 className="display-type select-none text-[5.5rem] leading-[0.92] text-on-accent drop-shadow-[0_2px_2px_rgba(6,78,59,0.45)]">
                ABBSY
              </h1>
              <p className="mt-4 tracking-[0.42em] text-xs font-semibold uppercase text-on-accent/95">
                FITNESS GYM
              </p>
              <div className="mt-6 h-px w-40 bg-on-accent/40" />
            </div>
          </div>
        </section>

        {/* Right column */}
        <section className="col-span-5 flex justify-center lg:col-span-3 lg:justify-end">
          <div className="w-full max-w-md rounded-2xl border border-on-accent/20 bg-white/95 px-6 py-8 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:px-10 sm:py-10">
            <header>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Welcome back</h2>
              <p className="mt-1 text-sm text-gray-500">Sign in to the Abbsey admin panel.</p>
            </header>

            {error ? (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="font-medium">{error}</p>
              </div>
            ) : null}

            <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
              <div>
                <label className="label-text" htmlFor="email">
                  Email address
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@abbsey.ph"
                    className="input-base pl-10"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="label-text" htmlFor="password">
                    Password
                  </label>
                  <a
                    href="#"
                    className="text-sm font-semibold text-green-600 transition hover:text-green-700"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-base pl-10 pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  id="keep-signed-in"
                  name="keep-signed-in"
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="keep-signed-in" className="text-sm text-gray-600">
                  Keep me signed in
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 py-3 text-sm font-semibold text-on-accent shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/40 border-t-on-accent" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-gray-500">
              Need access? Ask the gym admin to create your account.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
