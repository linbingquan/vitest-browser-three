import { describe, it, expect } from "vitest";
import { closeRelCompare } from "../src/assert/compare.ts";

describe("closeRelCompare", () => {
  it("passes when actual equals expected", () => {
    expect(closeRelCompare(1.0, 1.0, 1e-6)).toBe(true);
  });

  it("fails for small values where old floor-1 formula would pass", () => {
    // The old formula capped the allowed error at `tolerance`; here the
    // relative error is ~1e-3, so the new and old formulas disagree.
    expect(closeRelCompare(0.001001, 0.001, 1e-6)).toBe(false);
    // Stronger guard: even a tiny absolute delta must be judged by relative
    // error when the values are small.
    expect(closeRelCompare(0.000001001, 0.000001, 1e-6)).toBe(false);
  });

  it("uses 1e-12 floor to avoid division by zero / over-sensitivity", () => {
    // Both values near zero: allowed error is based on the 1e-12 floor, so
    // tiny differences between them pass.
    expect(closeRelCompare(1e-15, 1e-15, 1e-6)).toBe(true);
    expect(closeRelCompare(0, 0, 1e-6)).toBe(true);
    // But the difference must not exceed tolerance * 1e-12.
    expect(closeRelCompare(0, 1e-15, 1e-6)).toBe(false);
  });

  it("uses max(|a|, |e|) for symmetric scaling", () => {
    // When |a| is much larger than |e|, the tolerance must NOT scale from |e| alone.
    expect(closeRelCompare(100, 0.001, 1e-6)).toBe(false);
    expect(closeRelCompare(0.001, 100, 1e-6)).toBe(false);
  });

  it("handles boundary exactly at tolerance", () => {
    const tol = 1e-6;
    expect(closeRelCompare(1.0 + tol, 1.0, tol)).toBe(true);
    expect(closeRelCompare(1.0 + 2 * tol, 1.0, tol)).toBe(false);
  });

  it("tolerance = 0 behaves as exact equality", () => {
    expect(closeRelCompare(1.0, 1.0, 0)).toBe(true);
    expect(closeRelCompare(1.000001, 1.0, 0)).toBe(false);
  });
});
