import type { WebGPURenderer } from "three/webgpu";
import type { StorageInstancedBufferAttribute } from "three/webgpu";

/**
 * Read back the contents of a storage buffer attribute from the GPU.
 *
 * Uses the backend's built-in `getArrayBufferAsync`, which is available on
 * both the WebGPU and WebGL2 backends of WebGPURenderer.
 */
export async function readStorage(
  renderer: WebGPURenderer,
  attribute: StorageInstancedBufferAttribute,
): Promise<Float32Array> {
  const backend = renderer.backend as any;
  if (typeof backend.getArrayBufferAsync !== "function") {
    throw new Error(
      "[vitest-browser-three] Current three.js backend does not provide getArrayBufferAsync(). Please upgrade three.js.",
    );
  }
  const buffer: ArrayBuffer = await backend.getArrayBufferAsync(attribute);
  return new Float32Array(buffer.slice(0));
}
