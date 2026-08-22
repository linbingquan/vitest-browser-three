import { WebGPURenderer } from "three/webgpu";

export type BackendName = "webgpu" | "webgl";

const BACKEND_OPTIONS: Record<BackendName, { forceWebGL?: boolean }> = {
  webgpu: {},
  webgl: { forceWebGL: true },
};

interface BackendEntry {
  promise?: Promise<WebGPURenderer>;
  failed?: boolean;
}

// Per-backend renderer caches. A failed init is remembered (`failed`) so
// probes don't retry a backend that can't work in this environment.
const renderers: Record<BackendName, BackendEntry> = {
  webgpu: {},
  webgl: {},
};

export function getRenderer(backend: BackendName = "webgpu"): Promise<WebGPURenderer> {
  const entry = renderers[backend];
  if (!entry.promise && !entry.failed) {
    const renderer = new WebGPURenderer({ antialias: false, ...BACKEND_OPTIONS[backend] });
    renderer.debug.checkShaderErrors = true;
    entry.promise = renderer.init().then(() => renderer);
    // Attach a non-rethrowing catch to mark failure and silence unhandled
    // rejection, while preserving the rejected state for the original caller.
    entry.promise.catch((error) => {
      entry.failed = true;
      console.warn(
        `[vitest-browser-three] "${backend}" backend is not available in this environment (${error?.message ?? error}) — tests requiring it will be skipped.`,
      );
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

/** @internal test-only: inject a specific renderer instance for a backend. */
export function __setRendererForTest(
  renderer: WebGPURenderer,
  backend: BackendName = "webgpu",
): void {
  renderers[backend] = { promise: Promise.resolve(renderer) };
}
