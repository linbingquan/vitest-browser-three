/**
 * Low-level GPU compute test utilities.
 *
 * These primitives provide full control over the dispatch shape, allowing tests
 * that need:
 * - Multiple workgroups cooperating through shared/atomic memory
 * - Workgroup/subgroup identity checks
 * - Integer-typed buffer readback (Uint32Array/Int32Array)
 *
 * For most TSL expression assertions, use the higher-level `gpuTest` instead.
 */
import type { WebGPURenderer, StorageInstancedBufferAttribute } from "three/webgpu";
import type { BufferAttribute } from "three";
import { getRenderer, isBackendAvailable, type BackendName } from "./context.ts";

export interface RawComputeTestOptions {
  /**
   * GPU backend to use. Defaults to 'webgpu'.
   */
  backend?: BackendName;

  /**
   * WebGPU feature required by this test (e.g. 'subgroup').
   * If the renderer doesn't report the feature, the test is soft-skipped.
   */
  requiredFeature?: string;
}

/**
 * Context passed to the test callback with the ready-to-use renderer.
 */
export interface RawComputeTestContext {
  renderer: WebGPURenderer;
}

/**
 * Run a raw GPU compute test with full control over dispatch.
 *
 * Unlike `gpuTest` which batches assertions into a single dispatch, this
 * primitive lets the caller:
 * - Build and dispatch arbitrary TSL compute kernels
 * - Use shared/atomic memory across workgroups
 * - Read back integer-typed buffers
 * - Check workgroup/subgroup identity values
 *
 * The renderer is obtained from the shared cache (same as `gpuTest`).
 *
 * If the backend is unavailable or the required feature is not supported,
 * the test is soft-skipped with a warning (test passes, not fails).
 *
 * @param name - Test name used in skip/failure messages.
 * @param options - Backend and required feature. See {@link RawComputeTestOptions}.
 * @param fn - Callback receiving the ready renderer; may be async.
 * @returns Resolves after the callback completes, or after a soft-skip.
 *
 * @example
 * ```ts
 * it('atomic counter', async () => {
 *   await rawComputeTest('atomic add', { backend: 'webgpu' }, async ({ renderer }) => {
 *     // Build your own TSL kernel and dispatch
 *     await renderer.computeAsync(kernel);
 *     const data = await readUintBuffer(renderer, buffer.value);
 *     expect(data[0]).toBe(42);
 *   });
 * });
 * ```
 */
export async function rawComputeTest(
  name: string,
  options: RawComputeTestOptions,
  fn: (ctx: RawComputeTestContext) => Promise<void> | void,
): Promise<void> {
  const { backend = "webgpu", requiredFeature } = options;

  if (!(await isBackendAvailable(backend))) {
    console.warn(
      `[vitest-browser-three] rawComputeTest "${name}": skipping "${backend}" backend is not available in this environment.`,
    );
    return;
  }

  let renderer: WebGPURenderer;
  try {
    renderer = await getRenderer(backend);
  } catch {
    console.warn(
      `[vitest-browser-three] rawComputeTest "${name}": failed to get "${backend}" renderer.`,
    );
    return;
  }

  if (requiredFeature !== undefined) {
    // hasFeature may not exist on WebGL fallback renderer
    if (typeof renderer.hasFeature !== "function") {
      console.warn(
        `[vitest-browser-three] rawComputeTest "${name}": requiredFeature "${requiredFeature}" check skipped — current backend does not support feature detection.`,
      );
    } else if (!renderer.hasFeature(requiredFeature)) {
      console.warn(
        `[vitest-browser-three] rawComputeTest "${name}": skipping — "${backend}" backend does not support required feature "${requiredFeature}".`,
      );
      return;
    }
  }

  await fn({ renderer });
}

/**
 * Read back a storage buffer as Uint32Array.
 *
 * Use this for buffers declared with `uint` type in TSL storage definitions.
 * Unlike `readStorage` which returns Float32Array, this preserves integer
 * values exactly.
 *
 * @param renderer - The WebGPURenderer instance
 * @param buffer - Storage buffer attribute whose data is read back.
 * @returns Promise resolving to Uint32Array containing the buffer data
 *
 * @example
 * ```ts
 * const buffer = storage(new Uint32Array([0]), 'uint', 0);
 * // ... dispatch compute kernel that modifies buffer ...
 * const data = await readUintBuffer(renderer, buffer.value);
 * expect(data[0]).toBe(123);
 * ```
 */
export async function readUintBuffer(
  renderer: WebGPURenderer,
  buffer: StorageInstancedBufferAttribute | BufferAttribute,
): Promise<Uint32Array> {
  const arrayBuffer = await renderer.getArrayBufferAsync(buffer as BufferAttribute);
  return new Uint32Array(arrayBuffer);
}

/**
 * Read back a storage buffer as Int32Array.
 *
 * Use this for buffers declared with `int` type in TSL storage definitions.
 * Unlike `readStorage` which returns Float32Array, this preserves signed
 * integer values exactly.
 *
 * @param renderer - The WebGPURenderer instance
 * @param buffer - Storage buffer attribute whose data is read back.
 * @returns Promise resolving to Int32Array containing the buffer data
 *
 * @example
 * ```ts
 * const buffer = storage(new Int32Array([0]), 'int', 0);
 * // ... dispatch compute kernel that modifies buffer ...
 * const data = await readIntBuffer(renderer, buffer.value);
 * expect(data[0]).toBe(-1);
 * ```
 */
export async function readIntBuffer(
  renderer: WebGPURenderer,
  buffer: StorageInstancedBufferAttribute | BufferAttribute,
): Promise<Int32Array> {
  const arrayBuffer = await renderer.getArrayBufferAsync(buffer as BufferAttribute);
  return new Int32Array(arrayBuffer);
}
