# Buffer Readback

Functions for reading GPU buffer contents back to CPU.

## readStorage

Read back a storage buffer as `Float32Array`.

```ts
import { readStorage } from "vitest-browser-three";
import { storage } from "three/tsl";

const buffer = storage(new Float32Array([0]), "float", 0);
// ... compute kernel modifies buffer ...
const data = await readStorage(renderer, buffer.value);
```

**Returns**: `Promise<Float32Array>`

## readUintBuffer

Read back a storage buffer as `Uint32Array`.

Use this for buffers declared with `uint` type in TSL storage definitions.

```ts
import { readUintBuffer } from "vitest-browser-three";
import { instancedArray, atomicAdd, uint } from "three/tsl";

const counter = instancedArray(1, "uint").toAtomic();
const kernel = Fn(() => {
  atomicAdd(counter.element(uint(0)), uint(1));
})().compute(64, [8]);

await renderer.computeAsync(kernel);

const data = await readUintBuffer(renderer, counter.value);
console.log(data[0]); // 64
```

**Returns**: `Promise<Uint32Array>`

**Note**: Pass `buffer.value` explicitly (the underlying `StorageInstancedBufferAttribute`), not the TSL node. The `.value` property provides the actual attribute that the GPU backend can read from.

```ts
const buffer = instancedArray(1, "uint").toAtomic();
// buffer is a TSL node; buffer.value is the StorageInstancedBufferAttribute
const data = await readUintBuffer(renderer, buffer.value);
```

## readIntBuffer

Read back a storage buffer as `Int32Array`.

Use this for buffers declared with `int` type in TSL storage definitions. Preserves signed integer values exactly.

```ts
import { readIntBuffer } from "vitest-browser-three";
import { instancedArray, atomicAdd, int } from "three/tsl";

const counter = instancedArray(1, "int").toAtomic();
const kernel = Fn(() => {
  atomicAdd(counter.element(int(0)), int(1));
})().compute(32, [8]);

await renderer.computeAsync(kernel);

const data = await readIntBuffer(renderer, counter.value);
console.log(data[0]); // 32
```

**Returns**: `Promise<Int32Array>`

## Integer vs Float Readback

| Buffer Type     | Read Function    | Returns        |
| --------------- | ---------------- | -------------- |
| `uint` storage  | `readUintBuffer` | `Uint32Array`  |
| `int` storage   | `readIntBuffer`  | `Int32Array`   |
| `float` storage | `readStorage`    | `Float32Array` |

**Important**: Using the wrong read function can produce incorrect results:

```ts
// WRONG: Uint32Array interprets the bits as unsigned
const uintData = await readUintBuffer(renderer, floatBuffer.value);
console.log(uintData[0]); // 1073741824 (bits of 2.0 as uint32)

// CORRECT: Float32Array for float storage
const floatData = await readStorage(renderer, floatBuffer.value);
console.log(floatData[0]); // 2.0
```

## Usage with rawComputeTest

```ts
import { rawComputeTest, readUintBuffer } from "vitest-browser-three";

await rawComputeTest("my test", { backend: "webgpu" }, async ({ renderer }) => {
  const buffer = instancedArray(1, "uint").toAtomic();

  // Build and dispatch kernel
  const kernel = Fn(() => {
    /* ... */
  })().compute(64, [8]);
  await renderer.computeAsync(kernel);

  // Read back results
  const data = await readUintBuffer(renderer, buffer.value);
  expect(data[0]).toBe(expected);
});
```
