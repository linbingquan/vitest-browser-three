import { describe, it, afterAll, expect } from "vitest";
import { float, sin, cos, vec2, vec3, vec4 } from "three/tsl";
import { gpuTest, gpuFuzzTest, disposeRenderer } from "../src/index.ts";

describe("gpu smoke tests", () => {
  afterAll(async () => {
    await disposeRenderer();
  });

  it("scalar math", async () => {
    await gpuTest("scalar", ({ expectValue }) => {
      expectValue(sin(float(Math.PI / 2)), 1);
      expectValue(float(2).add(3), 5);
    });
  });

  it("vector ops vs CPU reference", async () => {
    const v = vec3(1, 2, 3);
    await gpuTest("vector", ({ expectClose, expectValue }) => {
      expectClose(v.mul(2), vec3(2, 4, 6));
      expectValue(v.add(vec3(0.5, 0.5, 0.5)), [1.5, 2.5, 3.5]);
      expectClose(vec4(v, 1), vec4(1, 2, 3, 1));
      expectClose(vec2(3, 4).length(), float(5));
    });
  });

  it("rejects more than 4 components in expectValue", async () => {
    await expect(
      gpuTest("too-many-components", ({ expectValue }) => {
        expectValue(float(1), [1, 2, 3, 4, 5]);
      }),
    ).rejects.toThrow(/1-4 components/);
  });

  it("rejects tests without assertions", async () => {
    await expect(gpuTest("no-assertions", () => {})).rejects.toThrow(/no assertions/);
  });

  it("fails with a dump when values mismatch", async () => {
    await expect(
      gpuTest("mismatch", ({ expectClose }) => {
        expectClose(float(1), float(2), 1e-6);
      }),
    ).rejects.toThrow(/actual.*expected/s);
  });

  it("multi-assertion: reports the exact failing assertion index", async () => {
    await expect(
      gpuTest("multi-row-addressing", ({ expectClose }) => {
        expectClose(float(1), float(1)); // #1 correct
        expectClose(float(2), float(3)); // #2 deliberately wrong
        expectClose(float(4), float(4)); // #3 correct
      }),
    ).rejects.toThrow(/assertion #2/);
  });

  it("tolerance boundary: within tolerance passes", async () => {
    await gpuTest("tolerance-pass", ({ expectClose }) => {
      // |1 - 1.0000005| = 5e-7 <= 1e-6 * max(1, 1)
      expectClose(float(1.0000005), float(1), 1e-6);
    });
  });

  it("tolerance boundary: beyond tolerance fails", async () => {
    await expect(
      gpuTest("tolerance-fail", ({ expectClose }) => {
        // |1 - 1.001| relative: 1e-3 > 1e-6 * 1
        expectClose(float(1.001), float(1), 1e-6);
      }),
    ).rejects.toThrow(/tolerance/);
  });
});

describe("gpuFuzzTest", () => {
  afterAll(async () => {
    await disposeRenderer();
  });

  it("sin over 128 instances matches CPU reference", async () => {
    await gpuFuzzTest("sin", {
      instances: 128,
      input: (i) => (i / 128) * Math.PI * 2,
      test: (x) => sin(x),
      expected: (x) => Math.sin(x),
      tolerance: 1e-3, // SwiftShader fast-math sin has ~1e-5 relative error
    });
  });

  it("pythagorean identity sin^2 + cos^2 = 1 over 64 instances", async () => {
    await gpuFuzzTest("sin-cos-identity", {
      instances: 64,
      input: (i) => (i / 64) * Math.PI,
      test: (x) =>
        sin(x)
          .mul(sin(x))
          .add(cos(x).mul(cos(x))),
      expected: () => 1,
      tolerance: 1e-3, // squared sin/cos approximation errors accumulate
    });
  });

  it("vec2(x, 2x).length() matches Math.hypot", async () => {
    await gpuFuzzTest("normalize-length", {
      instances: 32,
      input: (i) => 0.1 + (i / 32) * 9.9,
      test: (x) => vec2(x, x.mul(2)).length(),
      expected: (x) => Math.hypot(x, 2 * x),
    });
  });

  it("rejects invalid instance counts", async () => {
    await expect(
      gpuFuzzTest("bad-count", {
        instances: 0,
        input: () => 0,
        test: (x) => x,
        expected: (x) => x,
      }),
    ).rejects.toThrow(/positive integer/);
  });

  it("gpuFuzzTest expected rejects invalid component counts", async () => {
    await expect(
      gpuFuzzTest("bad-expected", {
        instances: 2,
        input: (i) => i,
        test: (x) => x,
        expected: () => [1, 2, 3, 4, 5],
      }),
    ).rejects.toThrow(/1-4 components/);
  });

  it("accepts 1-component array as scalar (broadcast)", async () => {
    await gpuFuzzTest("scalar-array", {
      instances: 4,
      input: (i) => i,
      test: (x) => x,
      expected: (x) => [x], // should broadcast like a scalar
    });
  });

  it("reports failing instance index and input", async () => {
    await expect(
      gpuFuzzTest("failing-fuzz", {
        instances: 8,
        input: (i) => i,
        test: (x) => x.mul(10),
        expected: (x) => (x === 5 ? 999 : x * 10), // only instance 5 is wrong
      }),
    ).rejects.toThrow(/instance 5 \(input 5\.0\)/);
  });
});
