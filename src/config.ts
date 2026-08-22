import type { BackendName } from "./context.js";

let defaultBackends: BackendName[] = ["webgpu", "webgl"];

/**
 * Configure library-wide defaults. Currently supported options:
 * - `backends`: default backend list for gpuTest/gpuFuzzTest calls that don't
 *   specify their own. Defaults to `['webgpu', 'webgl']`; unavailable backends
 *   are soft-skipped at runtime.
 */
export function configureGPU(options: { backends?: BackendName[] }): void {
  if (options.backends !== undefined) {
    if (!Array.isArray(options.backends) || options.backends.length === 0) {
      throw new Error("[vitest-browser-three] configureGPU: backends must be a non-empty array.");
    }
    defaultBackends = [...options.backends];
  }
}

export function getDefaultBackends(): BackendName[] {
  return [...defaultBackends];
}
