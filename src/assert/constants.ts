/**
 * @internal
 * Constants shared across the assertion system.
 */

/**
 * Generate a fresh canary value for a single test × backend invocation.
 *
 * Using a random integer avoids the stale-kernel false-positive on the
 * WebGL2 fallback: after a link failure the previously bound program may
 * still run and satisfy a fixed canary. Integers in this range round-trip
 * through float32 exactly, so the readback check can use strict equality.
 */
export function randomCanaryValue(): number {
  return 1000 + Math.floor(Math.random() * 9000);
}

export const MAX_COLUMNS = 4;

// Matrix types are stored column-major: mat3 = 3 columns of vec3, mat4 = 4
// columns of vec4 (see three's NodeBuilder.getElementType).
export const MATRIX_LAYOUT: Record<string, { columns: number; columnLength: number }> = {
  mat3: { columns: 3, columnLength: 3 },
  mat4: { columns: 4, columnLength: 4 },
};

export const SWIZZLE = ["x", "y", "z", "w"] as const;

/**
 * Absolute tolerance floor for values near zero in relative comparisons.
 * Stops the comparison from collapsing to exact equality (or division by
 * zero) when both values are tiny, where the relative scale `max(|a|, |e|)`
 * alone would force the allowed error toward zero and let floating-point
 * noise flip the result.
 */
export const ZERO_FLOOR = 1e-12;

export type Tuple9 = [number, number, number, number, number, number, number, number, number];
export type Tuple16 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
