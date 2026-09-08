# Fuzz Testing Examples

## Basic Fuzz Test

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { sin } from "three/tsl";

// Test sin against CPU reference
it("sin", async () => {
  await gpuFuzzTest("sin", {
    instances: 128,
    input: (i) => (i / 128) * Math.PI * 2,
    test: (x) => sin(x),
    expected: (x) => Math.sin(x),
    tolerance: 1e-3, // SwiftShader precision
  });
});
```

## Multiple Trigonometric Functions

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

## Vector Operations

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { vec2 } from "three/tsl";

it("vec2 length", async () => {
  await gpuFuzzTest("vec2 length", {
    instances: 32,
    input: (i) => 0.1 + (i / 32) * 9.9,
    test: (x) => vec2(x, x.mul(2)).length(),
    expected: (x) => Math.hypot(x, 2 * x),
  });
});
```

## Color Operations

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { vec3 } from "three/tsl";

it("color clamp", async () => {
  await gpuFuzzTest("color clamp", {
    instances: 50,
    input: (i) => (i / 50) * 3 - 1.5, // -1.5 to 1.5
    test: (x) => vec3(x, x, x).clamp(0, 1),
    expected: (x) => [
      Math.max(0, Math.min(1, x)),
      Math.max(0, Math.min(1, x)),
      Math.max(0, Math.min(1, x)),
    ],
  });
});
```

## Error Reporting

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";

// Reports exact failing instance
it("with error", async () => {
  await gpuFuzzTest("with error", {
    instances: 8,
    input: (i) => i,
    test: (x) => x.mul(10),
    expected: (x, i) => (i === 5 ? 999 : x * 10), // instance 5 is wrong
  });
});
// Throws: "instance 5 (input 5.0) failed"
```

## Scalar Broadcast

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three";
import { float } from "three/tsl";

it("scalar broadcast", async () => {
  await gpuFuzzTest("scalar broadcast", {
    instances: 4,
    input: (i) => i,
    test: (x) => x.add(float(1)),
    expected: (x) => [x + 1], // single-element array broadcasts
  });
});
```
