import { describe, it, afterAll } from "vitest";
import { Color } from "three/webgpu";
import { Fn, If, abs, color, float, mix, step, vec3 } from "three/tsl";
import { gpuTest, gpuFuzzTest, disposeRenderer } from "../src/index.js";

// Linear-sRGB components of the example's colors (ColorManagement converts
// the sRGB hex on construction, matching what color(hex) produces on GPU).
const green = new Color(0x6b9b6b);
const white = new Color(0xe4e4e4);

// The example snippet, refactored to take y as an explicit input:
// positionLocal is a geometry attribute with no meaning inside a compute
// dispatch, so the band-shading logic is tested as a pure function of y.
const bandColor = Fn(([_y]: [any]) => {
  const y = _y;
  const v = step(abs(y), 0.15);
  return mix(color(0x6b9b6b), color(0xe4e4e4), v);
});

describe("real-world snippets", () => {
  afterAll(async () => {
    await disposeRenderer();
  });

  it("band color boundary cases (Fn + step + mix + color)", async () => {
    await gpuTest(
      "band-color-boundaries",
      ({ closeRel }) => {
        closeRel(bandColor(float(0.0)), [white.r, white.g, white.b]); // inside band
        closeRel(bandColor(float(0.15)), [white.r, white.g, white.b]); // step(0.15, 0.15) = 1
        closeRel(bandColor(float(0.3)), [green.r, green.g, green.b]); // outside
        closeRel(bandColor(float(-0.2)), [green.r, green.g, green.b]); // abs handles negatives
      },
      { maxAssertions: 8 },
    );
  });

  it("band color sweep matches CPU reference", async () => {
    await gpuFuzzTest("band-color-sweep", {
      instances: 100,
      input: (i) => (i / 100) * 0.6 - 0.3, // y in [-0.3, 0.3]
      test: (y) => bandColor(y),
      expected: (y) => {
        const v = Math.abs(y) <= 0.15 ? 1 : 0;
        return [
          green.r + (white.r - green.r) * v,
          green.g + (white.g - green.g) * v,
          green.b + (white.b - green.b) * v,
        ];
      },
      tolerance: 1e-6,
    });
  });

  it("If conditional node picks colors in compute dispatch", async () => {
    await gpuTest(
      "conditional-color",
      ({ closeRel }) => {
        const pick = Fn(([_y]: [any]) => {
          const y = _y;
          let c = vec3(0, 0, 0);
          If(y.greaterThan(float(0)), () => {
            c.assign(color(0xff0000) as never);
          }).Else(() => {
            c.assign(color(0x0000ff) as never);
          });
          return c;
        });
        closeRel(pick(float(0.5)), [1, 0, 0]);
        closeRel(pick(float(-0.5)), [0, 0, 1]);
      },
      { maxAssertions: 8 },
    );
  });
});
