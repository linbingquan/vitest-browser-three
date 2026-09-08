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
  options: RawComputeTestOptions,
  fn: (ctx: RawComputeTestContext) => Promise<void> | void
): Promise<void>
```

## Parameters

| Parameter                 | Type                             | Description                                  |
| ------------------------- | -------------------------------- | -------------------------------------------- |
| `name`                    | `string`                         | Test name                                    |
| `options.backend`         | `'webgpu' \| 'webgl'`            | Backend to use (default: `'webgpu'`)         |
| `options.requiredFeature` | `string`                         | WebGPU feature required (e.g. `'subgroups'`) |
| `fn`                      | `(ctx) => Promise<void> \| void` | Callback receiving renderer; may be async    |

## Context

```ts
interface RawComputeTestContext {
  renderer: WebGPURenderer;
}
```

## Examples

### Basic Usage

```ts
import { it, expect } from "vitest";
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";
import { Fn, instancedArray, atomicAdd, uint } from "three/tsl";

it("atomic counter", async () => {
  await rawComputeTest("atomic counter", { backend: "webgpu" }, async ({ renderer }) => {
    const counter = instancedArray(1, "uint").toAtomic();

    const kernel = Fn(() => {
      atomicAdd(counter.element(uint(0)), uint(1));
    })().compute(64, [8]); // 64 invocations, 8 per workgroup

    await renderer.computeAsync(kernel);

    const data = await readUintBuffer(renderer, counter.value);
    expect(data[0]).toBe(64);
  });
});
```

### Seeded Atomic Operations

```ts
import { it, expect } from "vitest";
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";
import type { WebGPURenderer, StorageInstancedBufferAttribute } from "three/webgpu";
import { Fn, instancedArray, atomicStore, atomicSub, uint } from "three/tsl";

async function seed(
  renderer: WebGPURenderer,
  counter: StorageInstancedBufferAttribute,
  value: number,
) {
  const kernel = Fn(() => {
    atomicStore(counter.element(uint(0)), uint(value));
  })().compute(1);
  await renderer.computeAsync(kernel);
}

it("sub", async () => {
  await rawComputeTest("sub", { backend: "webgpu" }, async ({ renderer }) => {
    const counter = instancedArray(1, "uint").toAtomic();

    await seed(renderer, counter.value, 64); // Initialize to 64

    const kernel = Fn(() => {
      atomicSub(counter.element(uint(0)), uint(1));
    })().compute(64, [8]);

    await renderer.computeAsync(kernel);

    const data = await readUintBuffer(renderer, counter.value);
    expect(data[0]).toBe(0); // 64 - 64 = 0
  });
});
```

### With Required Feature

```ts
import { it } from "vitest";
import { rawComputeTest } from "vitest-browser-three";

it("subgroup operations", async () => {
  await rawComputeTest(
    "subgroup operations",
    { backend: "webgpu", requiredFeature: "subgroups" },
    async ({ renderer }) => {
      // Test subgroup features...
    },
  );
});
```

## Soft Skip Behavior

If the backend is unavailable, the required feature is not supported,
**or the backend does not support feature detection** (`hasFeature` is not a function),
the test is soft-skipped:

```
[vitest-browser-three] rawComputeTest "subgroup operations": skipping — "webgpu" backend does not support required feature "subgroups".
```

## Advanced Examples

### Signed Integer Buffer

```ts
import { it, expect } from "vitest";
import { rawComputeTest, readIntBuffer } from "vitest-browser-three";
import { Fn, instancedArray, atomicAdd, int } from "three/tsl";

it("signed counter", async () => {
  await rawComputeTest("signed counter", { backend: "webgpu" }, async ({ renderer }) => {
    const counter = instancedArray(1, "int").toAtomic();

    const kernel = Fn(() => {
      atomicAdd(counter.element(int(0)), int(1));
    })().compute(32, [8]);

    await renderer.computeAsync(kernel);

    const data = await readIntBuffer(renderer, counter.value);
    expect(data[0]).toBe(32);
  });
});
```

### Atomic Bitwise Operations

```ts
import { it, expect } from "vitest";
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";
import {
  Fn,
  instancedArray,
  atomicStore,
  atomicOr,
  uint,
  instanceIndex,
  shiftLeft,
} from "three/tsl";

it("atomic or", async () => {
  await rawComputeTest("atomic or", { backend: "webgpu" }, async ({ renderer }) => {
    const counter = instancedArray(1, "uint").toAtomic();

    // Seed with 0
    const seedKernel = Fn(() => {
      atomicStore(counter.element(uint(0)), uint(0));
    })().compute(1);
    await renderer.computeAsync(seedKernel);

    // Set bits
    const kernel = Fn(() => {
      const bit = shiftLeft(uint(1), instanceIndex);
      atomicOr(counter.element(uint(0)), bit);
    })().compute(32, [8]);

    await renderer.computeAsync(kernel);

    const data = await readUintBuffer(renderer, counter.value);
    expect(data[0]).toBe(0xffffffff); // All 32 bits set
  });
});
```

### Multiple Output Buffers

```ts
import { it, expect } from "vitest";
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";
import { Fn, instancedArray, atomicStore, atomicLoad, uint, instanceIndex } from "three/tsl";

it("load store", async () => {
  await rawComputeTest("load store", { backend: "webgpu" }, async ({ renderer }) => {
    const counter = instancedArray(1, "uint").toAtomic();
    const output = instancedArray(16, "uint");

    // Seed counter
    await renderer.computeAsync(
      Fn(() => {
        atomicStore(counter.element(uint(0)), uint(424242));
      })().compute(1),
    );

    // Load and store
    const kernel = Fn(() => {
      output.element(instanceIndex).assign(atomicLoad(counter.element(uint(0))));
    })().compute(16, [8]);

    await renderer.computeAsync(kernel);

    const data = await readUintBuffer(renderer, output.value);
    for (const value of data) {
      expect(value).toBe(424242);
    }
  });
});
```

## See Also

- [Buffer Readback](./readback.md) - `readUintBuffer`, `readIntBuffer`
