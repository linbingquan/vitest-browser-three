// Public entry point. Mirrors the official vitest-browser-* community plugins:
// `vitest-browser-three` re-exports the pure API and registers automatic GPU
// resource cleanup, while `vitest-browser-three/pure` stays side-effect free.
import { afterAll } from "vitest";
import { disposeRenderer } from "./pure.ts";

export {
  gpuTest,
  type GPUAssert,
  type GPURunOptions,
  type ExpectedValue,
  DEFAULT_TOLERANCE,
} from "./pure.ts";
export { gpuFuzzTest, type FuzzSpec } from "./pure.ts";
export { disposeRenderer, isBackendAvailable, type BackendName } from "./pure.ts";
export { configureGPU } from "./pure.ts";
export {
  rawComputeTest,
  type RawComputeTestOptions,
  type RawComputeTestContext,
  readUintBuffer,
  readIntBuffer,
} from "./pure.ts";

afterAll(async () => {
  await disposeRenderer();
});
