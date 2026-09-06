import { describe, it, expect } from "vitest";
import { float, sin } from "three/tsl";
import { gpuTest, gpuFuzzTest, isBackendAvailable, configureGPU } from "../src/index.js";

describe("stage-3: multi-backend support", () => {
  it("probes at least one usable backend in this environment", async () => {
    const webgpu = await isBackendAvailable("webgpu");
    const webgl = await isBackendAvailable("webgl");
    expect([webgpu, webgl]).toContain(true);
  });

  it("runs a suite on both backends", async () => {
    await gpuTest(
      "dual-backend",
      ({ eq, closeAbs }) => {
        eq(float(2).add(3), float(5));
        closeAbs(sin(float(Math.PI / 2)), float(1), 1e-3);
      },
      { backends: ["webgpu", "webgl"], maxAssertions: 8 },
    );
  });

  it("gpuFuzzTest runs on both backends", async () => {
    await gpuFuzzTest("dual-backend-fuzz", {
      instances: 32,
      input: (i) => (i / 32) * Math.PI,
      test: (x) => sin(x),
      expected: (x) => Math.sin(x),
      tolerance: 1e-3,
      backends: ["webgpu", "webgl"],
    });
  });

  it("fails when no requested backend is available", async () => {
    // Empty backends array is the only guaranteed-unavailable configuration
    // (no valid backend name can make it past configureGPU validation).
    // This tests the "no backends available" path, not the "invalid name" path.
    await expect(
      gpuTest("unavailable-backend", ({ eq }) => eq(float(1), float(1)), { backends: [] }),
    ).rejects.toThrow(/no requested GPU backends/);
  });

  it("configureGPU validates its options", () => {
    expect(() => configureGPU({ backends: [] })).toThrow(/non-empty array/);
  });

  it("configureGPU applies defaults (restore afterwards)", async () => {
    configureGPU({ backends: ["webgl"] });
    try {
      // Only webgl requested via defaults; suite must still pass.
      await gpuTest("configured-defaults", ({ eq }) => eq(float(1), float(1)));
    } finally {
      configureGPU({ backends: ["webgpu", "webgl"] });
    }
  });
});
