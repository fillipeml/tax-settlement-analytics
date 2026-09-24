import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { TermsProvider } from "@/lib/useTerms";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Tax Settlement Analytics",
  description:
    "What Brazil's federal treasury attorney actually accepts in individual tax settlements: patterns from the public corpus, plus a client-side simulator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <TermsProvider>
          <Header />
          {children}
          <footer
            className="mt-10 border-t px-4 py-4 text-center text-xs"
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
          >
            Public data from the PGFN (Portaria PGFN 6.757/2022) · portfolio project, no affiliation with any firm
          </footer>
        </TermsProvider>
      </body>
    </html>
  );
}
