import type { WebGPURenderer } from "three/webgpu";
import type { StorageInstancedBufferAttribute, BufferAttribute } from "three/webgpu";
import type { BackendLike } from "./three-internals.ts";

type TypedArray =
  | Float32Array
  | Uint32Array
  | Int32Array
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint8ClampedArray;

/**
 * @internal
 * Read back the contents of a storage buffer attribute from the GPU.
 *
 * Uses the backend's built-in `getArrayBufferAsync`, which is available on
 * both the WebGPU and WebGL2 backends of WebGPURenderer.
 */
export async function readStorage(
  renderer: WebGPURenderer,
  attribute: StorageInstancedBufferAttribute,
): Promise<Float32Array> {
  const backend = renderer.backend as unknown as BackendLike;
  if (typeof backend.getArrayBufferAsync !== "function") {
    throw new Error(
      "[vitest-browser-three] Current three.js backend does not provide getArrayBufferAsync(). Please upgrade three.js.",
    );
  }
  const buffer: ArrayBuffer = await backend.getArrayBufferAsync(attribute);
  return new Float32Array(buffer.slice(0));
}

/**
 * Read back a storage buffer as a typed array.
 *
 * @internal
 * Generic helper for consistent buffer readback across different TypedArray types.
 */
export async function readBufferAs<T extends TypedArray>(
  renderer: WebGPURenderer,
  buffer: StorageInstancedBufferAttribute | BufferAttribute,
  TypedArrayConstructor: new (buffer: ArrayBuffer) => T,
): Promise<T> {
  const backend = renderer.backend as unknown as BackendLike;
  if (typeof backend.getArrayBufferAsync !== "function") {
    throw new Error(
      "[vitest-browser-three] Current three.js backend does not provide getArrayBufferAsync(). Please upgrade three.js.",
    );
  }
  const arrayBuffer = await backend.getArrayBufferAsync(buffer as StorageInstancedBufferAttribute);
  return new TypedArrayConstructor(arrayBuffer.slice(0));
}
