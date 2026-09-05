# Assertions

Assertion methods available in `gpuTest` callback context.

## Overview

| Method               | Comparison                                    | Use Case                        |
| -------------------- | --------------------------------------------- | ------------------------------- |
| `eq`                 | Exact equality                                | Integers, exact fractions       |
| `closeAbs`           | `\|a - b\| <= tol`                            | Known scale, explicit tolerance |
| `closeRel`           | `\|a - b\| <= tol * max(\|a\|, \|b\|, 1e-12)` | Relative error, floats          |
| `greaterThan`        | `a > b`                                       | Ordering assertions             |
| `greaterThanOrEqual` | `a >= b`                                      | Ordering assertions             |
| `lessThan`           | `a < b`                                       | Ordering assertions             |
| `lessThanOrEqual`    | `a <= b`                                      | Ordering assertions             |

## eq

Exact component equality. Fails if any component differs (including `NaN !== NaN`).

```ts
await gpuTest("exact", ({ eq }) => {
  eq(float(2).mul(3), float(6));
  eq(vec3(1, 2, 3), [1, 2, 3]); // CPU array allowed
});
```

## closeAbs

Absolute tolerance comparison: `|a - b| <= tol`

```ts
await gpuTest("absolute", ({ closeAbs }) => {
  closeAbs(float(1), float(1.001), 0.01); // passes
  closeAbs(float(1), float(1.1), 0.01); // fails
});
```

## closeRel

Relative tolerance comparison: `|a - b| <= tol * max(|a|, |b|, 1e-12)`

This is the standard relative formula used by most testing libraries.

```ts
await gpuTest("relative", ({ closeRel }) => {
  closeRel(float(1), float(1.000001), 1e-5); // passes
  closeRel(float(0.001), float(0.001001), 1e-5); // fails, diff too large
});
```

### Tolerance for Small Values

The formula includes a floor of `1e-12` to prevent division by near-zero values:

```ts
// |1e-10 - 0| = 1e-10 > 1e-6 * 1e-12 = 1e-18 → fails
closeRel(float(1e-10), float(0), 1e-6);
```

## Relational Assertions

Component-wise comparisons:

```ts
await gpuTest("ordering", ({ greaterThan, lessThan }) => {
  greaterThan(float(5), float(3));
  greaterThanOrEqual(float(3), float(3));
  lessThan(float(3), float(5));
  lessThanOrEqual(float(3), float(3));
});
```

## Value Types

All assertion methods accept:

- **TSL nodes**: `float(1)`, `vec3(1, 2, 3)`, `mat4(...)`
- **CPU numbers**: `1`, `0.5`
- **CPU arrays**: `[1, 2, 3]`, `[[1, 2], [3, 4]]`
- **TypedArrays**: `Float32Array`, `Uint32Array`

## Custom Messages

```ts
await gpuTest("with message", ({ closeRel }) => {
  closeRel(float(1), float(2), 1e-6, "custom context");
});
// Error: "custom context - expected 2, got 1"
```

## Error Output

When an assertion fails:

```
gpuTest "my test" > scalar

expected 5, got 3
[backend: webgpu]
```

With multiple assertions, the index is reported:

```
gpuTest "multi" > multi-row-addressing

assertion #2 failed: expected 3, got 2
[backend: webgpu]
```
