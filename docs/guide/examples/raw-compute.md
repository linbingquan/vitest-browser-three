# Raw Compute Examples

## Atomic Counter

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

## Seeded Atomic Operations

```ts
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";
import { Fn, instancedArray, atomicStore, atomicSub, uint } from "three/tsl";

async function seed(renderer: any, counter: any, value: number) {
  const kernel = Fn(() => {
    atomicStore(counter.element(uint(0)), uint(value));
  })().compute(1);
  await renderer.computeAsync(kernel);
}

await rawComputeTest("seeded subtract", { backend: "webgpu" }, async ({ renderer }) => {
  const counter = instancedArray(1, "uint").toAtomic();

  await seed(renderer, counter, 64);

  const kernel = Fn(() => {
    atomicSub(counter.element(uint(0)), uint(1));
  })().compute(64, [8]);

  await renderer.computeAsync(kernel);

  const data = await readUintBuffer(renderer, counter.value);
  expect(data[0]).toBe(0);
});
```

## Signed Integer Buffer

```ts
import { rawComputeTest, readIntBuffer } from "vitest-browser-three";
import { Fn, instancedArray, atomicAdd, int } from "three/tsl";

await rawComputeTest("signed counter", { backend: "webgpu" }, async ({ renderer }) => {
  const counter = instancedArray(1, "int").toAtomic();

  const kernel = Fn(() => {
    atomicAdd(counter.element(int(0)), int(1));
  })().compute(32, [8]);

  await renderer.computeAsync(kernel);

  const data = await readIntBuffer(renderer, counter.value);
  expect(data[0]).toBe(32);
});
```

## Atomic Bitwise Operations

```ts
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
  expect(data[0] >>> 0).toBe(0xffffffff); // All 32 bits set
});
```

## With Required Feature

```ts
await rawComputeTest(
  "subgroup ops",
  {
    backend: "webgpu",
    requiredFeature: "subgroups",
  },
  async ({ renderer }) => {
    // Test subgroup-specific features
    // This test will be soft-skipped if subgroups are not supported
  },
);
```

## Multiple Output Buffers

```ts
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";
import { Fn, instancedArray, atomicStore, atomicLoad, uint, instanceIndex } from "three/tsl";

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
```
