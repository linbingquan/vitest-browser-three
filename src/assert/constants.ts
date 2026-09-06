/**
 * @internal
 * Constants shared across the assertion system.
 */

// Written unconditionally into a reserved row of the actual buffer. If the
// kernel fails to build (e.g. a NaN literal reaching generated WGSL),
// computeAsync may not reject at all — it just reports asynchronously — and
// every buffer reads back zero-initialized, so all assertions would silently
// compare 0 against 0 and pass. The canary's absence proves the dispatch
// never ran and lets us fail loudly instead.
export const CANARY_VALUE = 12345.6789;

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
