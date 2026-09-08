import { describe, it, expect } from "vitest";
import { float } from "three/tsl";
import { gpuTest } from "../src/index.ts";

// Regression test for the canary mechanism: a NaN literal reaching generated
// WGSL makes the shader module invalid, but WebGPURenderer reports the failure
// only asynchronously (computeAsync does not reject). Without the canary, all
// buffers read back zero-initialized and every assertion would silently pass
// as 0-vs-0.
//
// NOTE: Current coverage includes NaN literals. Additional edge cases (division
// by zero, type inference failures) are difficult to simulate reliably in a
// portable way across GPU backends and are noted here for future enhancement.
describe("canary mechanism", () => {
  it("detects kernels that never ran (NaN literal build failure)", async () => {
    await expect(
      gpuTest("nan-literal", ({ closeRel }) => {
        closeRel(float(Number.NaN).add(1), float(1));
      }),
    ).rejects.toThrow(/compute kernel never ran.*canary mismatch/s);
  });

  // NOTE: Division by zero may produce Inf/NaN but GPU compilers often optimize
  // these away. The NaN test above is the most reliable way to trigger shader
  // build failure in this test environment.
  //
  // Additional coverage to consider (platform-dependent):
  // - Division by zero: float(1).div(0) may produce Inf rather than NaN
  // - Type inference failure: passing unsupported node types
  // - Numeric overflow: very large values that exceed f32 range
});
