# rawComputeTest

Low-level GPU compute test for full dispatch control. Use this for tests that need:

- Multiple workgroups cooperating through shared/atomic memory
- Integer-typed buffer readback (Uint32Array/Int32Array)
- Custom dispatch shapes

For most TSL expression assertions, use `gpuTest` instead.

## Signature

```ts
rawComputeTest(
  name: string,
  options: RawComputeOptions,
  fn: (ctx: RawComputeContext) => Promise<void> | void
): Promise<void>
```

## Parameters

| Parameter                 | Type                  | Description                                  |
| ------------------------- | --------------------- | -------------------------------------------- |
| `name`                    | `string`              | Test name                                    |
| `options.backend`         | `'webgpu' \| 'webgl'` | Backend to use (default: `'webgpu'`)         |
| `options.requiredFeature` | `string`              | WebGPU feature required (e.g. `'subgroups'`) |
| `fn`                      | `(ctx) => void`       | Callback receiving renderer                  |

## Context

```ts
interface RawComputeContext {
  renderer: WebGPURenderer;
}
```

## Examples

### Basic Usage

```ts
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";
import { Fn, instancedArray, atomicAdd, uint } from "three/tsl";

await rawComputeTest("atomic counter", { backend: "webgpu" }, async ({ renderer }) => {
  const counter = instancedArray(1, "uint").toAtomic();

  const kernel = Fn(() => {
    atomicAdd(counter.element(uint(0)), uint(1));
  })().compute(64, [8]); // 64 invocations, 8 per workgroup

  await renderer.computeAsync(kernel);

  const data = await readUintBuffer(renderer, counter.value);
  expect(data[0]).toBe(64);
});
```

### Seeded Atomic Operations

```ts
import { atomicStore, atomicLoad } from "three/tsl";

async function seed(renderer, counter, value) {
  const kernel = Fn(() => {
    atomicStore(counter.element(uint(0)), uint(value));
  })().compute(1);
  await renderer.computeAsync(kernel);
}

await rawComputeTest("sub", { backend: "webgpu" }, async ({ renderer }) => {
  const counter = instancedArray(1, "uint").toAtomic();

  await seed(renderer, counter, 64); // Initialize to 64

  const kernel = Fn(() => {
    atomicSub(counter.element(uint(0)), uint(1));
  })().compute(64, [8]);

  await renderer.computeAsync(kernel);

  const data = await readUintBuffer(renderer, counter.value);
  expect(data[0]).toBe(0); // 64 - 64 = 0
});
```

### With Required Feature

```ts
await rawComputeTest(
  "subgroup operations",
  { backend: "webgpu", requiredFeature: "subgroups" },
  async ({ renderer }) => {
    // Test subgroup features...
  },
);
```

## Soft Skip Behavior

If the backend is unavailable or the required feature is not supported, the test is soft-skipped:

```
[vitest-browser-three] rawComputeTest "subgroup": skipping — "webgpu" backend does not support required feature "subgroups".
```

## See Also

- [Buffer Readback](./readback.md) - `readUintBuffer`, `readIntBuffer`
