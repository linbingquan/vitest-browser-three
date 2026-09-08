# Raw Compute Examples

## Atomic Counter

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

## Seeded Atomic Operations

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

it("seeded subtract", async () => {
  await rawComputeTest("seeded subtract", { backend: "webgpu" }, async ({ renderer }) => {
    const counter = instancedArray(1, "uint").toAtomic();

    await seed(renderer, counter.value, 64);

    const kernel = Fn(() => {
      atomicSub(counter.element(uint(0)), uint(1));
    })().compute(64, [8]);

    await renderer.computeAsync(kernel);

    const data = await readUintBuffer(renderer, counter.value);
    expect(data[0]).toBe(0);
  });
});
```

## Signed Integer Buffer

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

## Atomic Bitwise Operations

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

## With Required Feature

```ts
import { it } from "vitest";
import { rawComputeTest } from "vitest-browser-three";

it("subgroup ops", async () => {
  await rawComputeTest(
    "subgroup ops",
    {
      backend: "webgpu",
      requiredFeature: "subgroups",
    },
    async ({ renderer }) => {
      // Test subgroup-specific features
      // This test will be soft-skipped if the subgroup feature is not supported
    },
  );
});
```

## Multiple Output Buffers

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
