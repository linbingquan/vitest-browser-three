import { describe, it, expect } from "vitest";
import { float, sin, cos, vec2, vec3, vec4, mat3, mat4 } from "three/tsl";
import { blendColor } from "three/tsl";
import { Matrix4 } from "three/webgpu";
import { gpuTest, gpuFuzzTest } from "../src/index.ts";

describe("gpu smoke tests", () => {
  it("scalar math", async () => {
    await gpuTest("scalar", ({ closeRel }) => {
      closeRel(sin(float(Math.PI / 2)), 1);
      closeRel(float(2).add(3), 5);
    });
  });

  it("vector ops vs CPU reference", async () => {
    const v = vec3(1, 2, 3);
    await gpuTest("vector", ({ closeRel }) => {
      closeRel(v.mul(2), vec3(2, 4, 6));
      closeRel(v.add(vec3(0.5, 0.5, 0.5)), [1.5, 2.5, 3.5]);
      closeRel(vec4(v, 1), vec4(1, 2, 3, 1));
      closeRel(vec2(3, 4).length(), float(5));
    });
  });

  it("rejects more than 4 components in CPU constants", async () => {
    await expect(
      gpuTest("too-many-components", ({ closeRel }) => {
        closeRel(float(1), [1, 2, 3, 4, 5]);
      }),
    ).rejects.toThrow(/components, got 5/);
  });

  it("rejects tests without assertions", async () => {
    await expect(gpuTest("no-assertions", () => {})).rejects.toThrow(/no assertions/);
  });

  it("fails with a dump when values mismatch", async () => {
    await expect(
      gpuTest("mismatch", ({ closeRel }) => {
        closeRel(float(1), float(2), 1e-6);
      }),
    ).rejects.toThrow(/actual.*expected/s);
  });

  it("multi-assertion: reports the exact failing assertion index", async () => {
    await expect(
      gpuTest("multi-row-addressing", ({ closeRel }) => {
        closeRel(float(1), float(1)); // #1 correct
        closeRel(float(2), float(3)); // #2 deliberately wrong
        closeRel(float(4), float(4)); // #3 correct
      }),
    ).rejects.toThrow(/assertion #2/);
  });

  it("tolerance boundary: within tolerance passes", async () => {
    await gpuTest("tolerance-pass", ({ closeRel }) => {
      // |1 - 1.0000005| ~ 5e-7 <= 1e-6 * max(1.0000005, 1) ~ 1.0000005e-6
      closeRel(float(1.0000005), float(1), 1e-6);
    });
  });

  it("tolerance boundary: beyond tolerance fails", async () => {
    await expect(
      gpuTest("tolerance-fail", ({ closeRel }) => {
        // |1 - 1.001| relative: 1e-3 > 1e-6 * 1
        closeRel(float(1.001), float(1), 1e-6);
      }),
    ).rejects.toThrow(/tolerance/);
  });
});

describe("gpuFuzzTest", () => {
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
    ).rejects.toThrow(/components, got 5/);
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

describe("stage-2: type resolution, matrices, relational assertions", () => {
  it("relational assertions pass", async () => {
    await gpuTest(
      "relations-pass",
      ({ greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual }) => {
        greaterThan(float(5), float(3));
        greaterThanOrEqual(float(3), float(3));
        lessThan(float(3), float(5));
        lessThanOrEqual(float(3), float(3));
      },
    );
  });

  it("relational failure reports the operator and values", async () => {
    await expect(
      gpuTest("relations-fail", ({ lessThan }) => {
        lessThan(float(5), float(3));
      }),
    ).rejects.toThrow(/expected < 3\.0, got 5\.0/);
  });

  it("eq is exact (rejects representable differences)", async () => {
    await expect(
      gpuTest("eq-exact", ({ eq }) => {
        eq(float(1), float(1.000001)); // distinct in f32
      }),
    ).rejects.toThrow(/expected 1\.0000009536743164, got 1\.0/);
  });

  it("eq accepts exactly equal values", async () => {
    await gpuTest("eq-ok", ({ eq }) => {
      eq(float(2).mul(3), float(6));
    });
  });

  it("mat3 rotation matches CPU reference", async () => {
    const angle = Math.PI / 4;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    await gpuTest(
      "mat3-rotation",
      ({ closeRel }) => {
        // mat3 is 3 columns of vec3; TSL constructor is column-major like mat4
        closeRel(mat3(c, s, 0, -s, c, 0, 0, 0, 1), [c, s, 0, -s, c, 0, 0, 0, 1], 1e-6);
      },
      { maxAssertions: 4 }, // mat3 needs 3 rows, one extra row for safety
    );
  });

  it("mat4 rotation matches CPU reference", async () => {
    const angle = Math.PI / 3;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    await gpuTest(
      "mat4-rotation",
      ({ closeRel }) => {
        closeRel(
          mat4(c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
          [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          1e-6,
        );
      },
      { maxAssertions: 8 }, // one mat4 assertion needs a 4-row stride
    );
  });

  it("mat4 times vector rotates correctly", async () => {
    // NOTE: do NOT compare raw mat4 elements against Matrix4.elements here —
    // TSL's mat4(Matrix4) conversion transposes relative to three's
    // column-major element order on r0.185. Verify behaviour via transforms.
    const angle = Math.PI / 2;
    const rot = mat4(new Matrix4().makeRotationZ(angle));
    const c = Math.cos(angle); // ~6.12e-17 in f64
    await gpuTest(
      "mat4-transform",
      ({ closeRel }) => {
        closeRel(rot.mul(vec4(1, 0, 0, 1)), vec4(c, 1, 0, 1), 1e-6);
        closeRel(rot.mul(vec4(0, 1, 0, 1)), vec4(-1, c, 0, 1), 1e-6);
      },
      { maxAssertions: 8 },
    );
  });

  it("mixed scalar + vector + matrix assertions coexist", async () => {
    await gpuTest(
      "mixed",
      ({ eq, closeRel }) => {
        eq(float(2).add(2), float(4));
        closeRel(vec3(1, 2, 3).mul(2), vec3(2, 4, 6));
        closeRel(
          mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
          [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        );
      },
      { maxAssertions: 16 },
    );
  });

  it("type mismatch throws a clear error", async () => {
    await expect(
      gpuTest("type-mismatch", ({ eq }) => {
        eq(float(1), vec3(1, 2, 3));
      }),
    ).rejects.toThrow(/type mismatch.*"float".*"vec3"/s);
  });
});

describe("standard relative tolerance semantics", () => {
  it("closeRel is strict for small expected values", async () => {
    // diff = 5e-7 > 1e-6 * max(|a|,|e|) ~ 1e-7 -> must fail
    await expect(
      gpuTest("closeRel-small-values", ({ closeRel }) => {
        closeRel(float(0.1000005), float(0.1), 1e-6);
      }),
    ).rejects.toThrow(/tolerance/);
  });

  it("closeRel uses the standard relative formula for CPU constants", async () => {
    await expect(
      gpuTest("expectValue-small-values", ({ closeRel }) => {
        closeRel(float(0.1000005), 0.1, 1e-6);
      }),
    ).rejects.toThrow(/tolerance/);
  });

  it("rejects invalid maxAssertions", async () => {
    await expect(
      gpuTest("bad-max", ({ eq }) => eq(float(1), float(1)), { maxAssertions: 0 }),
    ).rejects.toThrow(/positive integer/);
  });
});

describe("assertion messages", () => {
  it("custom message appears in failure output", async () => {
    await expect(
      gpuTest("message-test", ({ closeRel }) => {
        closeRel(float(1), float(2), 1e-6, "custom context");
      }),
    ).rejects.toThrow(/custom context/);
  });
});

describe("vec4 and blend operations", () => {
  it("blendColor: standard over alpha compositing", async () => {
    await gpuTest("blendColor", ({ closeAbs }) => {
      // Fully opaque blend layer completely replaces the base.
      closeAbs(blendColor(vec4(0.2, 0.4, 0.6, 0.5), vec4(1, 0, 0, 1)), vec4(1, 0, 0, 1), 1e-4);

      // Fully transparent blend layer leaves the base unchanged.
      closeAbs(
        blendColor(vec4(0.2, 0.4, 0.6, 0.7), vec4(1, 1, 1, 0)),
        vec4(0.2, 0.4, 0.6, 0.7),
        1e-4,
      );

      // General over compositing.
      const outAlpha = 0.75;
      const outR = (1 * 0.5 * 0.5) / outAlpha;
      const outG = (1 * 0.5) / outAlpha;
      closeAbs(
        blendColor(vec4(1, 0, 0, 0.5), vec4(0, 1, 0, 0.5)),
        vec4(outR, outG, 0, outAlpha),
        1e-4,
      );
    });
  });
});
