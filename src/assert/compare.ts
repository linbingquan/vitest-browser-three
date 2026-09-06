/**
 * @internal
 * Comparison logic for assertion results.
 */

import { ZERO_FLOOR } from "./constants.ts";

export type AssertionKind =
  | "eq"
  | "closeAbs"
  | "closeRel"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual";

export const RELATIONAL_OPS: Partial<Record<AssertionKind, string>> = {
  greaterThan: ">",
  greaterThanOrEqual: ">=",
  lessThan: "<",
  lessThanOrEqual: "<=",
};

/**
 * Standard relative tolerance comparison.
 * Returns true iff `|actual - expected| <= tolerance * max(|actual|, |expected|, ZERO_FLOOR)`.
 *
 * Using `max(|a|, |e|)` (rather than `|e|` alone) keeps the tolerance
 * symmetric so that a tiny `expected` does not make the test trivially easy
 * to satisfy; `ZERO_FLOOR` covers the case where both values are near zero.
 *
 * Shared by `compareComponents` (gpuTest path) and `runFuzzBackend`
 * (gpuFuzzTest path) so both APIs use identical semantics.
 */
export function closeRelCompare(actual: number, expected: number, tolerance: number): boolean {
  return (
    Math.abs(actual - expected) <=
    tolerance * Math.max(Math.abs(actual), Math.abs(expected), ZERO_FLOOR)
  );
}

/**
 * Absolute tolerance comparison. Returns true iff |actual - expected| <= tolerance.
 */
export function closeAbsCompare(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

export interface ComparisonResult {
  index: number;
  actual: number;
  expected: number;
  ok: boolean;
}

export function compareComponents(
  actual: number[],
  expected: number[],
  kind: AssertionKind,
  tolerance: number,
): ComparisonResult[] {
  return actual.map((a, i) => {
    const e = expected[i];
    let ok: boolean;
    switch (kind) {
      case "eq":
        ok = a === e;
        break;
      case "closeAbs":
        ok = Math.abs(a - e) <= tolerance;
        break;
      case "closeRel":
        ok = closeRelCompare(a, e, tolerance);
        break;
      case "greaterThan":
        ok = a > e;
        break;
      case "greaterThanOrEqual":
        ok = a >= e;
        break;
      case "lessThan":
        ok = a < e;
        break;
      case "lessThanOrEqual":
        ok = a <= e;
        break;
    }
    return { index: i, actual: a, expected: e, ok };
  });
}

function formatFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

export function describeFailure(
  kind: AssertionKind,
  tolerance: number,
  d: ComparisonResult,
  label: string,
): string {
  const op = RELATIONAL_OPS[kind];
  const core = op
    ? `expected ${op} ${formatFloat(d.expected)}, got ${formatFloat(d.actual)}`
    : `expected ${formatFloat(d.expected)}, got ${formatFloat(d.actual)} (tolerance ${tolerance})`;
  return `${label}, component ${d.index}: ${core}`;
}
