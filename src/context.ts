import { WebGPURenderer } from "three/webgpu";

export type BackendName = "webgpu" | "webgl";

const BACKEND_OPTIONS: Record<BackendName, { forceWebGL?: boolean }> = {
  webgpu: {},
  webgl: { forceWebGL: true },
};

/** @internal Per-backend renderer caches. */
interface BackendEntry {
  promise?: Promise<WebGPURenderer>;
  failed?: boolean;
}

// Per-backend renderer caches. A failed init is remembered (`failed`) so
// probes don't retry a backend that can't work in this environment.
/** @internal Per-backend renderer caches. */
const renderers: Record<BackendName, BackendEntry> = {
  webgpu: {},
  webgl: {},
};

/** @internal Exported for library-internal use (e.g. src/index.ts cleanup); not part of the public API. */
export async function getRenderer(backend: BackendName = "webgpu"): Promise<WebGPURenderer> {
  const entry = renderers[backend];
  if (!entry.promise && !entry.failed) {
    const renderer = new WebGPURenderer({ antialias: false, ...BACKEND_OPTIONS[backend] });
    renderer.debug.checkShaderErrors = true;
    entry.promise = renderer.init().then(() => renderer);
    // Attach a non-rethrowing catch to mark failure and silence unhandled
    // rejection, while preserving the rejected state for the original caller.
    entry.promise.catch(() => {
      entry.failed = true;
    });
  }
  if (entry.failed || !entry.promise) {
    throw new Error(
      `[vitest-browser-three] "${backend}" backend is unavailable in this environment.`,
    );
  }
  return entry.promise;
}

/** Probe whether a backend can initialize in this environment. */
export async function isBackendAvailable(backend: BackendName): Promise<boolean> {
  try {
    await getRenderer(backend);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter a requested backend list down to those available in the current
 * environment, soft-skipping unavailable backends with a warning. Throws if
 * none are available.
 *
 * @param requested - Backends requested by the test (typically from options or defaults)
 * @param context - Human-readable context for error messages, e.g. `gpuTest "my test"`
 * @returns The list of available backends (non-empty)
 */
export async function resolveAvailableBackends(
  requested: BackendName[],
  context: string,
): Promise<BackendName[]> {
  const available: BackendName[] = [];
  for (const backend of requested) {
    if (await isBackendAvailable(backend)) {
      available.push(backend);
    } else {
      console.warn(`[vitest-browser-three] ${context}: skipping unavailable "${backend}" backend.`);
    }
  }
  if (available.length === 0) {
    throw new Error(
      `[vitest-browser-three] ${context}: no requested GPU backends are available (requested: ${requested.join(", ")}).`,
    );
  }
  return available;
}

export async function disposeRenderer(backend?: BackendName): Promise<void> {
  if (backend) {
    const entry = renderers[backend];
    if (entry.promise) {
      try {
        const renderer = await entry.promise;
        renderer.dispose();
      } catch {
        // init failed; nothing to dispose
      }
      delete entry.promise;
      entry.failed = false;
    }
  } else {
    await Promise.all([disposeRenderer("webgpu"), disposeRenderer("webgl")]);
  }
}
