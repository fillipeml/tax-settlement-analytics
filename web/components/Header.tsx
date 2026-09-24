"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const DASHBOARD_LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/discounts", label: "Discounts" },
  { href: "/guarantees", label: "Guarantees & recovery" },
  { href: "/terms", label: "Terms" },
];

function signedInName(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)tsa_name=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function Header() {
  const route = usePathname();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => setName(signedInName()), [route]);

  if (route === "/sign-in") return null;
  const onDashboard = DASHBOARD_LINKS.some((l) => route === l.href);

  async function signOut() {
    await fetch("/api/sign-out", { method: "POST" });
    setName(null);
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="no-print border-b-2" style={{ background: "var(--surface)", borderColor: "var(--ink)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2 py-3">
          <Link href="/app" className="flex min-w-0 shrink-0 items-center gap-3">
            <Image src="/mark.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" priority />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight" style={{ color: "var(--ink)" }}>
                Tax Settlement Analytics
              </p>
              <p className="hidden text-xs lg:block" style={{ color: "var(--ink-2)" }}>
                {onDashboard ? "Market view · public PGFN corpus" : "Practitioner workspace"}
              </p>
            </div>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/app" className={`rounded-md px-3 py-2 font-medium ${route === "/app" ? "link-nav-active" : "link-nav"}`}>
              Home
            </Link>
            {onDashboard &&
              DASHBOARD_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-2.5 py-2 font-medium sm:px-3 ${route === l.href ? "link-nav-active" : "link-nav"}`}
                >
                  {l.label}
                </Link>
              ))}
            {!onDashboard && route !== "/app" && (
              <Link href="/overview" className="link-nav rounded-md px-3 py-2 font-medium">
                Market view
              </Link>
            )}
            {name && (
              <span className="flex items-center gap-2 pl-2 text-xs" style={{ color: "var(--ink-2)" }}>
                <span className="hidden md:inline">{name}</span>
                <button onClick={signOut} className="btn-outline rounded-md px-3 py-1.5 font-medium">
                  Sign out
                </button>
              </span>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
