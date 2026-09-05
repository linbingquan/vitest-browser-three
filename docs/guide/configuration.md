# Configuration

## Backend Selection

Tests run against both backends by default: `'webgpu'` and `'webgl'` (WebGPURenderer with `forceWebGL: true`).

### Per-Suite Selection

```ts
import { gpuTest } from "vitest-browser-three";

// Test specific backends
await gpuTest("smoke", ({ eq }) => eq(float(2).add(3), float(5)), {
  backends: ["webgpu", "webgl"],
});

// WebGPU only (for features like subgroup)
await gpuTest("webgpu only", ({ eq }) => eq(float(2).add(3), float(5)), {
  backends: ["webgpu"],
});
```

### Library-Wide Default

```ts
import { configureGPU } from "vitest-browser-three";

// Set default for all subsequent tests
configureGPU({ backends: ["webgpu"] });
```

> **Note**: `configureGPU` mutates global state. Use per-call `backends` options when running test files in parallel.

## Environment Probing

```ts
import { isBackendAvailable } from "vitest-browser-three";

const webgpu = await isBackendAvailable("webgpu");
const webgl = await isBackendAvailable("webgl");

if (!webgpu && !webgl) {
  console.warn("No GPU backend available");
}
```

## Soft Skip Behavior

Unavailable backends are soft-skipped with a warning. The test only fails when no requested backend is available:

```
[vitest-browser-three] gpuTest "smoke": skipping "webgpu" backend is not available in this environment.
```

Failures are tagged with `[backend: xxx]`:

```
Assertion failed: expected 5, got 3 [backend: webgpu]
```

## Renderer Cleanup

The default entry auto-disposes the shared GPU renderer via `afterAll`:

```ts
import { gpuTest } from "vitest-browser-three"; // auto-cleanup
```

If you import from the side-effect-free entry, add cleanup manually:

```ts
import { disposeRenderer } from "vitest-browser-three/pure";
import { afterAll } from "vitest";

afterAll(async () => {
  await disposeRenderer();
});
```
