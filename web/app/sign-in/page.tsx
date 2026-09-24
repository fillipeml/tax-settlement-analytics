"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const r = await fetch("/api/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    setSending(false);
    if (r.ok) {
      router.push(params.get("from") || "/app");
      router.refresh();
    } else {
      const j = await r.json().catch(() => null);
      setError(j?.error ?? "Could not sign in.");
    }
  }

  return (
    <form onSubmit={signIn} className="w-full max-w-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>
        Tax Settlement Analytics
      </p>
      <h1 className="font-display mt-1 text-3xl" style={{ color: "var(--ink)" }}>
        Practitioner workspace
      </h1>
      <p className="mb-8 mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
        Individual settlement simulator and intelligence on the public PGFN corpus.
      </p>
      <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
        Username
      </label>
      <input
        value={user}
        onChange={(e) => setUser(e.target.value)}
        autoComplete="username"
        className="card mb-4 w-full px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        autoFocus
      />
      <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
        Password
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        className="card mb-5 w-full px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
      />
      {error && (
        <p className="mb-4 rounded-md border px-3 py-2 text-xs font-medium" style={{ borderColor: "#e8b0b0", background: "#fceeee", color: "#7a1f1f" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={sending} className="btn-primary w-full rounded-md py-2.5 text-sm font-semibold disabled:opacity-60">
        {sending ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
        Accounts are configured through environment variables. Demo deployments sign visitors in automatically.
      </p>
    </form>
  );
}

export default function SignIn() {
  return (
    <main className="flex min-h-screen flex-col lg:grid lg:grid-cols-[1.15fr_1fr]">
      {/* Brand panel: compact band on mobile, full column on desktop */}
      <section className="relative h-52 shrink-0 overflow-hidden sm:h-64 lg:h-auto" style={{ background: "var(--ink)" }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 20% 10%, rgba(109,40,217,.45) 0%, rgba(109,40,217,0) 55%), radial-gradient(ellipse at 90% 90%, rgba(167,139,250,.25) 0%, rgba(167,139,250,0) 50%)",
          }}
        />
        <div className="absolute left-6 top-6 lg:left-12 lg:top-12">
          <Image src="/mark.svg" alt="" width={44} height={44} className="rounded-xl" priority />
        </div>
        <div className="absolute bottom-0 left-0 p-6 lg:p-12">
          <p className="font-display text-3xl leading-tight text-white lg:text-5xl">
            What the treasury
            <span className="hidden lg:inline">
              <br />
            </span>
            <span className="lg:hidden"> </span>
            actually accepts.
          </p>
          <p className="mt-2 max-w-md text-xs leading-relaxed lg:mt-4 lg:text-sm" style={{ color: "#c9c6d6" }}>
            Real acceptance patterns from Brazil&apos;s individual tax settlements, and a simulator that keeps the
            client&apos;s data in the browser.
          </p>
          <p className="mt-4 hidden text-xs lg:mt-8 lg:block" style={{ color: "#9d99b3" }}>
            Portfolio project by Fillipe Loose · public PGFN data
          </p>
        </div>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10 lg:py-16" style={{ background: "var(--surface)" }}>
        <Suspense>
          <SignInForm />
        </Suspense>
      </section>
    </main>
  );
}
