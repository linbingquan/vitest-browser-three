import type { BackendName } from "./context.ts";

export const DEFAULT_BACKENDS: BackendName[] = ["webgpu", "webgl"];

let defaultBackends: BackendName[] = [...DEFAULT_BACKENDS];

/**
 * Configure library-wide defaults. Currently supported options:
 * - `backends`: default backend list for gpuTest/gpuFuzzTest calls that don't
 *   specify their own. Defaults to `['webgpu', 'webgl']`; unavailable backends
 *   are soft-skipped at runtime.
 *
 * **Warning**: This mutates global state. Avoid calling this inside parallel
 * test files; prefer per-call `backends` options for isolation.
 */
export function configureGPU(options: { backends?: BackendName[] }): void {
  if (options.backends !== undefined) {
    if (!Array.isArray(options.backends) || options.backends.length === 0) {
      throw new Error("[vitest-browser-three] configureGPU: backends must be a non-empty array.");
    }
    for (const backend of options.backends) {
      if (backend !== "webgpu" && backend !== "webgl") {
        throw new Error(
          `[vitest-browser-three] configureGPU: invalid backend "${String(backend)}". Expected "webgpu" or "webgl".`,
        );
      }
    }
    defaultBackends = [...options.backends];
  }
}

export function getDefaultBackends(): BackendName[] {
  return [...defaultBackends];
}

/** Reset library defaults to the initial value. Useful for test cleanup. */
export function resetDefaultBackends(): void {
  defaultBackends = [...DEFAULT_BACKENDS];
}
