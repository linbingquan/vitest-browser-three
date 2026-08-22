import { describe, it, afterAll, expect } from "vitest";
import { float, sin, vec2, vec3, vec4 } from "three/tsl";
import { gpuTest, disposeRenderer } from "../src/index.ts";

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
