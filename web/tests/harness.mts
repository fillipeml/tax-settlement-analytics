/** Minimal test harness: no dependencies, runs on Node's native type stripping. */

let passed = 0;
let failed = 0;

export function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${detail}`.trimEnd());
  }
}

export const near = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol;

export function section(title: string): void {
  console.log(`\n[${title}]`);
}

export function done(): never {
  console.log(`\nResult: ${passed} ok, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
