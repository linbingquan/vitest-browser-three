# vitest-browser-three Guide

GPU-native assertions for three.js TSL expressions in Vitest Browser Mode.

## Contents

- [Getting Started](./getting-started.md) - Installation and first test
- [Configuration](./configuration.md) - Backend selection and environment setup
- [API Reference](./api/)
  - [`gpuTest`](./api/gpu-test.md) - Batch assertions for TSL expressions
  - [`gpuFuzzTest`](./api/gpu-fuzz-test.md) - Fuzz testing with deterministic inputs
  - [`rawComputeTest`](./api/raw-compute.md) - Low-level GPU compute control
  - [Buffer Readback](./api/readback.md) - readUintBuffer, readIntBuffer
- [Pure API](./pure.md) - Core primitives without side effects
- [Examples](./examples/)
- [Best Practices](./best-practices.md) - Tolerance selection, backend fallback
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## Quick Example

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float, sin } from "three/tsl";

it("vector math", async () => {
  await gpuTest("vector math", ({ eq, closeRel }) => {
    eq(float(2).add(3), float(5));
    closeRel(sin(float(Math.PI / 2)), 1, 1e-3);
  });
});
```
