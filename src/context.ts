import { WebGPURenderer } from "three/webgpu";

/**
 * Lazily-created, module-level singleton renderer.
 *
 * Creating and disposing a WebGPURenderer per test would slow the suite down
 * to minutes, so all tests in a vitest worker share one renderer instance.
 */
let rendererPromise: Promise<WebGPURenderer> | null = null;

export function getRenderer(): Promise<WebGPURenderer> {
  if (!rendererPromise) {
    const renderer = new WebGPURenderer({ antialias: false });
    renderer.debug.checkShaderErrors = true;
    rendererPromise = renderer.init().then(() => renderer);
  }
  return rendererPromise;
}

export async function disposeRenderer(): Promise<void> {
  if (!rendererPromise) return;
  const renderer = await rendererPromise;
  rendererPromise = null;
  renderer.dispose();
}
