# gpuFuzzTest

Run fuzz tests against three.js TSL expressions with deterministic inputs.

## Signature

```ts
gpuFuzzTest(name: string, spec: GpuFuzzSpec): Promise<void>
```

## Parameters

```ts
interface GpuFuzzSpec {
  instances: number; // Number of test instances (must be positive integer)
  input: (i: number) => number; // CPU input value generator
  test: (x: Node) => Node; // TSL expression under test
  expected: (x: number) => number | number[]; // CPU reference value
  tolerance?: number; // Relative tolerance (default: 1e-6)
}
```

## Examples

### Basic Fuzz Test

```ts
import { gpuFuzzTest } from "vitest-browser-three";
import { sin } from "three/tsl";

await gpuFuzzTest("sin", {
  instances: 128,
  input: (i) => (i / 128) * Math.PI * 2,
  test: (x) => sin(x),
  expected: (x) => Math.sin(x),
  tolerance: 1e-3, // SwiftShader fast-math sin has ~1e-5 error
});
```

### Identity Function

```ts
await gpuFuzzTest("identity", {
  instances: 64,
  input: (i) => i,
  test: (x) => x,
  expected: (x) => x,
});
```

### Vector Output

```ts
await gpuFuzzTest("normalize", {
  instances: 32,
  input: (i) => 0.1 + (i / 32) * 9.9,
  test: (x) => vec2(x, x.mul(2)).normalize(),
  expected: (x) => [x / Math.hypot(x, 2 * x), (2 * x) / Math.hypot(x, 2 * x)],
});
```

### Pythagorean Identity

```ts
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
```

## Error Handling

### Invalid Instance Count

```ts
// Throws: instances must be a positive integer
gpuFuzzTest("bad", {
  instances: 0,
  input: (i) => i,
  test: (x) => x,
  expected: (x) => x,
});
```

### Component Count Mismatch

```ts
// Throws: expected array must match test output components
gpuFuzzTest("mismatch", {
  instances: 2,
  input: (i) => i,
  test: (x) => x,
  expected: () => [1, 2, 3, 4, 5], // 5 components not matching
});
```

### Failing Instance Report

```ts
// Throws: reports the failing instance index and input
gpuFuzzTest("failing", {
  instances: 8,
  input: (i) => i,
  test: (x) => x.mul(10),
  expected: (x) => (x === 5 ? 999 : x * 10), // instance 5 is wrong
});
// Error: "instance 5 (input 5.0) failed"
```
