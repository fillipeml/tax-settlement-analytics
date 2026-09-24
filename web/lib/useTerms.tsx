"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { categoriseSector, termKindOf } from "./categories";
import { debtBandOf, NOT_IDENTIFIED, yearOf, type Dataset, type Term } from "./types";

interface Filters {
  region: string;
  year: string;
  sector: string; // canonical category (categoriseSector), not the free text
  band: string;
  recovery: string; // "" | "yes" | "no"
  kind: string; // "Original term" | "Amendment / renegotiation"
}

const EMPTY_FILTERS: Filters = { region: "", year: "", sector: "", band: "", recovery: "", kind: "" };

interface Ctx {
  dataset: Dataset | null;
  loading: boolean;
  filters: Filters;
  setFilter: (k: keyof Filters, v: string) => void;
  clear: () => void;
  terms: Term[]; // already filtered
  options: { regions: string[]; years: string[]; sectors: string[]; bands: string[]; kinds: string[] };
}

const TermsContext = createContext<Ctx | null>(null);

export function TermsProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => {
    fetch("/data/terms.json")
      .then((r) => r.json())
      .then(setDataset)
      .finally(() => setLoading(false));
  }, []);

  const terms = useMemo(() => {
    if (!dataset) return [];
    return dataset.terms.filter(
      (t) =>
        (!filters.region || t.region === filters.region) &&
        (!filters.year || yearOf(t) === filters.year) &&
        (!filters.sector || categoriseSector(t.sector) === filters.sector) &&
        (!filters.band || debtBandOf(t.consolidated_amount) === filters.band) &&
        (!filters.recovery ||
          (filters.recovery === "yes" ? t.judicial_recovery === true : t.judicial_recovery !== true)) &&
        (!filters.kind || termKindOf(t.modality, t.title) === filters.kind),
    );
  }, [dataset, filters]);

  const options = useMemo(() => {
    const all = dataset?.terms ?? [];
    const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();
    return {
      regions: uniq(all.map((t) => t.region)),
      years: uniq(all.map(yearOf)).filter((a) => a !== "N/A"),
      sectors: uniq(all.map((t) => categoriseSector(t.sector))).filter((s) => s !== NOT_IDENTIFIED),
      bands: uniq(all.map((t) => debtBandOf(t.consolidated_amount))).filter((b) => b !== NOT_IDENTIFIED),
      kinds: uniq(all.map((t) => termKindOf(t.modality, t.title))).filter((k) => k !== "Not identified"),
    };
  }, [dataset]);

  const value: Ctx = {
    dataset,
    loading,
    filters,
    setFilter: (k, v) => setFilters((f) => ({ ...f, [k]: v })),
    clear: () => setFilters(EMPTY_FILTERS),
    terms,
    options,
  };

  return <TermsContext.Provider value={value}>{children}</TermsContext.Provider>;
}

export function useTerms(): Ctx {
  const ctx = useContext(TermsContext);
  if (!ctx) throw new Error("useTerms must be used inside TermsProvider");
  return ctx;
}
