/** Deterministic human-validation sample. */
import { hashDjb2, SAMPLE_SIZE, validationSample } from "../lib/sample.ts";
import type { Term } from "../lib/types.ts";
import { check, done, section } from "./harness.mts";

const term = (id: string, simulated = false) => ({ id, simulated }) as Term;
const corpus = Array.from({ length: 200 }, (_, i) => term(`id-${i}`));

section("deterministic sample");
const a1 = validationSample(corpus);
const a2 = validationSample([...corpus].reverse()); // input order must not matter
check(`default size = ${SAMPLE_SIZE}`, a1.length === SAMPLE_SIZE);
check("deterministic: same sample for any input order", JSON.stringify(a1.map((x) => x.id)) === JSON.stringify(a2.map((x) => x.id)));
check("no duplicates", new Set(a1.map((x) => x.id)).size === a1.length);
check("hash spreads (does not just take the first 60 ids)", a1.some((x) => parseInt(x.id.slice(3)) >= 100));
check("simulated terms never enter", validationSample([term("a", true), term("b"), term("c")], 3).every((x) => !x.simulated));
check("corpus smaller than n returns everything", validationSample(corpus.slice(0, 10)).length === 10);
check("stable hash (regression)", hashDjb2("id-1") === hashDjb2("id-1") && hashDjb2("id-1") !== hashDjb2("id-2"));

done();
