import { it, expect, afterAll } from "vitest";
import { float } from "three/tsl";
import { gpuTest, disposeRenderer } from "../src/index.ts";

// Regression test for the canary mechanism: a NaN literal reaching generated
// WGSL makes the shader module invalid, but WebGPURenderer reports the failure
// only asynchronously (computeAsync does not reject). Without the canary, all
// buffers read back zero-initialized and every assertion would silently pass
// as 0-vs-0.
it("canary detects kernels that never ran (NaN literal build failure)", async () => {
  await expect(
    gpuTest("nan-literal", ({ expectClose }) => {
      expectClose(float(Number.NaN).add(1), float(1));
    }),
  ).rejects.toThrow(/compute kernel never ran.*canary value missing/s);
});

afterAll(async () => {
  // The failed pipeline above leaves the shared renderer with an errored
  // device state on some backends; dispose so later test files re-init clean.
  await disposeRenderer();
});
