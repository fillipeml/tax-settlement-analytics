/** Deterministic sample for the human validation of the extraction.
 *
 *  Why 60 and not "10 % of the corpus": the target (>= 95 % accuracy on the key fields) is
 *  demonstrated with a FIXED sample size, not a percentage. 60 terms x 3 key fields = 180
 *  checks; if at most 4 errors are found, the lower bound of the exact binomial 95 %
 *  confidence interval stays above 95 %, and the target is certified. More errors than that
 *  means a systematic problem: fix the prompt and re-extract instead of reviewing by hand.
 *
 *  The draw is PSEUDO-RANDOM AND DETERMINISTIC (hash of the term id): every reviewer sees the
 *  same sample on any machine and session, so progress is never lost to a new draw.
 */

import type { Term } from "./types.ts";

export const SAMPLE_SIZE = 60;

/** djb2: a stable, cheap string hash; it only needs to spread well. */
export function hashDjb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Draws `n` terms from the corpus by sorting on the hash of the id (deterministic shuffle).
 *  Simulated terms never enter. */
export function validationSample(terms: Term[], n = SAMPLE_SIZE): Term[] {
  return terms
    .filter((t) => !t.simulated)
    .map((t) => ({ t, h: hashDjb2(t.id) }))
    .sort((a, b) => a.h - b.h || a.t.id.localeCompare(b.t.id))
    .slice(0, n)
    .map((x) => x.t);
}
