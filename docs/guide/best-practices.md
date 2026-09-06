# Best Practices

## Tolerance Selection

### Floating-Point Comparisons

Use `closeRel` for most floating-point comparisons:

```ts
// Good: relative tolerance handles various scales
closeRel(sin(float(x)), float(Math.sin(x)), 1e-5);

// Avoid: absolute tolerance can fail at small values
closeAbs(sin(float(x)), float(Math.sin(x)), 1e-5);
```

### SwiftShader Considerations

SwiftShader (software renderer used in CI/containers) has reduced precision for transcendental functions:

```ts
// SwiftShader fast-math sin has ~1e-5 relative error
await gpuFuzzTest("sin", {
  tolerance: 1e-3, // Use 1e-3 for trig functions (accounts for platform differences)
});
```

**Why use 1e-3 instead of 1e-5?**

Tolerance must account for:

1. **Single operation error**: SwiftShader fast-math sin ≈ 1e-5 relative error
2. **Accumulated errors**: Multiple operations compound the error
3. **Platform variance**: Hardware GPUs may differ slightly from CPU reference

Start with 1e-3 for trig functions, or 1e-4 for simple arithmetic. If tests are flaky, relax the tolerance; if they pass consistently, you can try tightening it.

### Integer Comparisons

Use `eq` for integers and exact values:

```ts
eq(float(2).add(3), float(5)); // Exact match
```

## Backend Selection

### WebGPU vs WebGL

| Feature         | WebGPU           | WebGL             |
| --------------- | ---------------- | ----------------- |
| Precision       | Full             | Limited           |
| Performance     | Hardware         | Software fallback |
| Storage buffers | Multi-read       | Single-read       |
| Subgroups       | Via feature flag | Not supported     |

### Default Behavior

Tests run against both backends by default. Use `backends` option to target specific backends:

```ts
// WebGPU only (required for some features)
await gpuTest("subgroup", ({ eq }) => eq(...), {
  backends: ["webgpu"],
});
```

## Canary Mechanism

The library uses a canary value to detect silent failures (e.g., shader compilation errors):

```ts
it("detects silent failures", async () => {
  await expect(
    gpuTest("nan-literal", ({ closeRel }) => {
      closeRel(float(Number.NaN).add(1), float(1));
    }),
  ).rejects.toThrow(/canary value missing/);
});
```

Never skip this test — it validates that failures are properly reported.

## Memory Management

### Storage Buffer Constraints

On three.js r0.185, unused storage nodes can break buffer registration:

```ts
// BAD: unused buffer causes registration failure
const unused = storage(new Float32Array([0]), "float", 0);
const kernel = Fn(() => {
  // unused is never used in the kernel
})().compute(1);
```

```ts
// GOOD: only create buffers that are actually used
const buffer = storage(new Float32Array([0]), "float", 0);
const kernel = Fn(() => {
  buffer.element(uint(0)).assign(float(1));
})().compute(1);
```

## Matrix Assertions

### Workaround for TSL mat4 Transpose

TSL's `mat4(Matrix4)` is transposed relative to `Matrix4.elements`:

```ts
// Verify through transformation, not raw elements
const rot = mat4(new Matrix4().makeRotationZ(Math.PI / 2));
closeRel(rot.mul(vec4(1, 0, 0, 1)), vec4(0, 1, 0, 1), 1e-6);
```

### Matrix Assertion Stride

Each `mat4` assertion occupies 4 rows. Set `maxAssertions` accordingly:

```ts
await gpuTest(
  "matrices",
  ({ closeRel }) => {
    // 2 mat4 assertions = 8 rows needed
    closeRel(mat4(...), [...], 1e-6);
    closeRel(mat4(...), [...], 1e-6);
  },
  { maxAssertions: 8 },
);
```

## Test Organization

### Parallel Test Files

Avoid `configureGPU` when running test files in parallel:

```ts
// In parallel test files, use per-call backend option
await gpuTest("test", ({ eq }) => eq(...), {
  backends: ["webgpu"], // Instead of configureGPU
});
```

### Cleanup

Import from the default entry for automatic cleanup:

```ts
import { gpuTest } from "vitest-browser-three"; // auto-disposes renderer
```

For side-effect-free imports:

```ts
import { disposeRenderer } from "vitest-browser-three/pure";
import { afterAll } from "vitest";

afterAll(async () => {
  await disposeRenderer();
});
```
