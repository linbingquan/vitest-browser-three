# gpuFuzzTest

Run fuzz tests against three.js TSL expressions with deterministic inputs.

## Signature

```ts
gpuFuzzTest(name: string, spec: FuzzSpec): Promise<void>
```

## Parameters

```ts
interface FuzzSpec {
  instances: number; // Number of test instances (must be positive integer)
  input: (i: number) => number; // CPU input value generator (receives instance index)
  test: (x: Node<"float">) => Node; // TSL expression under test
  expected: (x: number, instance: number) => number | number[]; // CPU reference value
  tolerance?: number; // Tolerance (default: 1e-6)
  absolute?: boolean; // Use absolute tolerance instead of relative (default: false)
  backends?: BackendName[]; // Backends to run this suite against. Defaults to configureGPU's setting, or ['webgpu', 'webgl']. Unavailable backends are soft-skipped.
}
```

## Examples

### Basic Fuzz Test

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { sin } from "three/tsl";

it("sin", async () => {
  await gpuFuzzTest("sin", {
    instances: 128,
    input: (i) => (i / 128) * Math.PI * 2,
    test: (x) => sin(x),
    expected: (x) => Math.sin(x),
    tolerance: 1e-3,
    absolute: true, // Use absolute tolerance for periodic functions
  });
});
```

### Sampling Near Discontinuities

When fuzzing functions with discontinuities (e.g., `fract`, `step`), use half-step sampling to avoid landing exactly on a discontinuity, where f32/f64 precision differences can cause spurious failures:

```ts
input: (i) => ((i + 0.5) / 128) * Math.PI * 2; // half-step
```

For continuous functions like `sin` and `cos`, both `(i / n)` and `((i + 0.5) / n)` work; half-step is a defensive habit recommended by the project's design decisions.

When to use `absolute: true`:

For periodic functions like `sin` and `cos`, f32 (GPU) and f64 (CPU) precision differences can cause relative tolerance to fail near zero crossings. For example, `sin(f32(π))` typically returns a value very close to 0 on GPU but `Math.sin(f32(π))` returns `-8.74e-8` due to double precision computation. Using absolute tolerance avoids this issue.

### Identity Function

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";

it("identity", async () => {
  await gpuFuzzTest("identity", {
    instances: 64,
    input: (i) => i,
    test: (x) => x,
    expected: (x) => x,
  });
});
```

### Vector Output

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { vec2 } from "three/tsl";

it("normalize", async () => {
  await gpuFuzzTest("normalize", {
    instances: 32,
    input: (i) => 0.1 + (i / 32) * 9.9,
    test: (x) => vec2(x, x.mul(2)).normalize(),
    expected: (x) => [x / Math.hypot(x, 2 * x), (2 * x) / Math.hypot(x, 2 * x)],
  });
});
```

### Pythagorean Identity

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { sin, cos } from "three/tsl";

it("sin-cos-identity", async () => {
  await gpuFuzzTest("sin-cos-identity", {
    instances: 64,
    input: (i) => (i / 64) * Math.PI,
    test: (x) =>
      sin(x)
        .mul(sin(x))
        .add(cos(x).mul(cos(x))),
    expected: () => 1,
    tolerance: 1e-3,
  });
});
```

### Absolute Tolerance for Cos

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { cos } from "three/tsl";

it("cos", async () => {
  await gpuFuzzTest("cos", {
    instances: 64,
    input: (i) => (i / 64) * Math.PI * 2,
    test: (x) => cos(x),
    expected: (x) => Math.cos(x),
    tolerance: 1e-3,
    absolute: true,
  });
});
```

## Error Handling

### Invalid Instance Count

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";

it("bad instance count", async () => {
  // Throws: instances must be a positive integer
  await gpuFuzzTest("bad", {
    instances: 0,
    input: (i) => i,
    test: (x) => x,
    expected: (x) => x,
  });
});
```

### Component Count Mismatch

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";

it("mismatch", async () => {
  // Throws: expected array must match test output components
  await gpuFuzzTest("mismatch", {
    instances: 2,
    input: (i) => i,
    test: (x) => x,
    expected: () => [1, 2, 3, 4, 5], // 5 components not matching
  });
});
```

### Failing Instance Report

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";

it("failing", async () => {
  // Throws: reports the failing instance index and input
  await gpuFuzzTest("failing", {
    instances: 8,
    input: (i) => i,
    test: (x) => x.mul(10),
    expected: (x, i) => (i === 5 ? 999 : x * 10), // instance 5 is wrong
  });
});
// Error: "instance 5 (input 5.0) failed"
```
