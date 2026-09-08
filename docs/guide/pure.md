# Pure API Guide

The `vitest-browser-three/pure` entry point provides the core GPU test primitives
**without any implicit side effects**. It is intended for:

- Library authors who want to embed GPU assertions in their own test utilities
- Advanced users who need fine-grained control over backend selection and resource lifecycle
- Projects that want to keep their test setup minimal and avoid automatic global registrations

## What's different from the main entry?

| Feature                                                       | `vitest-browser-three` (main)                            | `vitest-browser-three/pure`                   |
| ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| Renderer lifecycle management                                 | ✅ (registers `afterAll` hook to call `disposeRenderer`) | ❌ (you must call `disposeRenderer` yourself) |
| Core test APIs (`gpuTest`, `gpuFuzzTest`, …)                  | ✅                                                       | ✅                                            |
| Low-level compute access (`rawComputeTest`, integer readback) | ✅                                                       | ✅                                            |

The `pure` entry gives you the same building blocks, but without the
automatic `afterAll` cleanup — you control when renderers are disposed.

## Import

```ts
import {
  gpuTest,
  gpuFuzzTest,
  rawComputeTest,
  configureGPU,
  disposeRenderer,
  isBackendAvailable,
  readUintBuffer,
  readIntBuffer,
} from "vitest-browser-three/pure";
```

## Manual Backend Configuration & Cleanup

Since `pure` does not perform any automatic setup, you must configure backends
and dispose renderers yourself. A typical Vitest setup file:

```ts
// tests/setup.ts
import { beforeAll, afterEach } from "vitest";
import { configureGPU, disposeRenderer } from "vitest-browser-three/pure";

beforeAll(() => {
  // Force WebGPU only (fail if unavailable, or use soft-skip later)
  configureGPU({ backends: ["webgpu"] });
});

afterEach(async () => {
  // Dispose renderer(s) to free GPU memory after every test
  await disposeRenderer();
});
```

## Usage Examples

### gpuTest

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three/pure";
import { float, sin, vec4 } from "three/tsl";

it("basic assertion", async () => {
  await gpuTest("scalar math", ({ eq, closeRel }) => {
    eq(float(2).add(3), float(5));
    closeRel(sin(float(Math.PI / 2)), 1, 1e-3);
  });
});

it("vector math", async () => {
  await gpuTest("vec4 add", ({ eq }) => {
    eq(vec4(1, 2, 3, 4).add(vec4(10, 20, 30, 40)), vec4(11, 22, 33, 44));
  });
});
```

### gpuTest with Custom Options

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three/pure";
import { float } from "three/tsl";

it("custom options", async () => {
  await gpuTest(
    "my test",
    ({ closeAbs }) => {
      closeAbs(float(1.5).mul(2), 3, 1e-6);
    },
    {
      maxAssertions: 10, // raise if you need more assertions per test
      backends: ["webgl"], // override default backends for this test only
    },
  );
});
```

### gpuFuzzTest

```ts
import { it } from "vitest";
import { gpuFuzzTest } from "vitest-browser-three/pure";
import { sin, cos } from "three/tsl";

it("trig identity", async () => {
  await gpuFuzzTest("sin²x + cos²x ≈ 1", {
    instances: 1024,
    input: (i) => (i / 1024) * Math.PI * 2,
    test: (x) => sin(x).pow(2).add(cos(x).pow(2)),
    expected: () => 1,
    tolerance: 1e-6,
    absolute: true, // use absolute tolerance near zero crossings
  });
});
```

### rawComputeTest — Low-Level Compute Control

Use `rawComputeTest` when you need to work with multiple workgroups, shared
memory, or integer buffers.

```ts
import { it, expect } from "vitest";
import { rawComputeTest, readUintBuffer } from "vitest-browser-three/pure";
import { storage, Fn, uint } from "three/tsl";

it("atomic counter via rawComputeTest", async () => {
  await rawComputeTest(
    "atomic add",
    { backend: "webgpu", requiredFeature: "subgroups" },
    async ({ renderer }) => {
      // Create an integer storage buffer
      const buffer = storage(new Uint32Array([0]), "uint", 0);

      // Build a kernel that increments the counter
      const kernel = Fn(() => {
        buffer.element(0).assign(buffer.element(0).add(uint(1)));
      })().compute(1);

      await renderer.computeAsync(kernel);

      // Read back as exact integers
      const data = await readUintBuffer(renderer, buffer.value);
      expect(data[0]).toBe(1);
    },
  );
});
```

Note: `requiredFeature` is soft-skipped if the backend doesn't support it — the
test will pass with a warning instead of failing.

### Reading Integer Buffers

```ts
import { readUintBuffer, readIntBuffer } from "vitest-browser-three/pure";

// renderer comes from ctx.renderer in rawComputeTest callback;
// someUintBuffer / someIntBuffer is the .value of your storage or atomic buffer.
const uintData = await readUintBuffer(renderer, someUintBuffer);
const intData = await readIntBuffer(renderer, someIntBuffer);
```

### Checking Backend Availability

```ts
import { isBackendAvailable } from "vitest-browser-three/pure";

const webgpuAvailable = await isBackendAvailable("webgpu");
if (webgpuAvailable) {
  // run webgpu-specific tests
}
```

## TypeScript Support

All public APIs are fully typed. Common types you may want to import:

```ts
import type {
  GPUAssert,
  GPURunOptions,
  ExpectedValue,
  FuzzSpec,
  RawComputeTestOptions,
  RawComputeTestContext,
  BackendName,
} from "vitest-browser-three/pure";
```

## Best Practices

- **Always configure and dispose manually.** Use `beforeAll` / `afterEach`
  hooks or a setup file to avoid GPU memory leaks.
- **Use `isBackendAvailable`** to conditionally skip tests instead of relying
  on `configureGPU` to soft-skip at runtime.
- **Prefer `gpuTest` for most assertions** — it batches work efficiently.
  Reserve `rawComputeTest` for cases that require direct control.
- **Be mindful of renderer reuse.** The renderer is cached per backend; if you
  need a fresh one, call `disposeRenderer(backend)` first.
