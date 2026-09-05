// Reference: three.js test/unit/addons/tsl/TSLBlendModes.tests.js
// MIT license — ported as API validation example for gpuTest.
//
// Blend-mode function coverage (src/nodes/display/BlendModes.js). Every
// expected value below is the plain closed-form formula for that blend mode,
// hand-evaluated in plain JS/comments — not derived by re-running the TSL
// expression under test.
import { describe, it } from "vitest";
import {
  blendBurn,
  blendColor,
  blendDodge,
  blendOverlay,
  blendScreen,
  vec3,
  vec4,
} from "three/tsl";
import { gpuTest } from "../../src/index.ts";

describe("upstream: blend mode functions", () => {
  it("blendBurn() darkens base using blend — min(1, (1-base)/blend), inverted", async () => {
    await gpuTest("blendBurn", ({ closeAbs }) => {
      // A white blend layer (1) leaves the base unchanged: 1-min(1,(1-b)/1) = b.
      closeAbs(blendBurn(vec3(0.3, 0.6, 0.9), vec3(1, 1, 1)), vec3(0.3, 0.6, 0.9), 1e-4);

      // General case: burn(b, e) = 1 - min(1, (1-b)/e).
      // base=0.5, blend=0.5 -> 1 - min(1, 0.5/0.5) = 1 - 1 = 0.
      closeAbs(blendBurn(vec3(0.5), vec3(0.5)), vec3(0), 1e-4);

      // base=0.8, blend=0.4 -> 1 - min(1, 0.2/0.4) = 1 - 0.5 = 0.5.
      closeAbs(blendBurn(vec3(0.8), vec3(0.4)), vec3(0.5), 1e-4);
    });
  });

  it("blendDodge() lightens base using blend — min(base/(1-blend), 1)", async () => {
    await gpuTest("blendDodge", ({ closeAbs }) => {
      // A black blend layer (0) leaves the base unchanged: min(b/(1-0), 1) = b.
      closeAbs(blendDodge(vec3(0.3, 0.6, 0.9), vec3(0, 0, 0)), vec3(0.3, 0.6, 0.9), 1e-4);

      // dodge(b, e) = min(b/(1-e), 1).
      // base=0.5, blend=0.5 -> min(0.5/0.5, 1) = 1.
      closeAbs(blendDodge(vec3(0.5), vec3(0.5)), vec3(1), 1e-4);

      // base=0.2, blend=0.5 -> min(0.2/0.5, 1) = 0.4.
      closeAbs(blendDodge(vec3(0.2), vec3(0.5)), vec3(0.4), 1e-4);
    });
  });

  it("blendScreen() — 1 - (1-base)*(1-blend)", async () => {
    await gpuTest("blendScreen", ({ closeAbs }) => {
      // screen(b, e) = 1 - (1-b)(1-e).
      closeAbs(blendScreen(vec3(0), vec3(0)), vec3(0), 1e-6);
      closeAbs(blendScreen(vec3(1), vec3(0.5)), vec3(1), 1e-4); // white base always stays white
      closeAbs(blendScreen(vec3(0.5), vec3(0.5)), vec3(1 - 0.5 * 0.5), 1e-4); // == 0.75
      closeAbs(blendScreen(vec3(0.2), vec3(0.6)), vec3(1 - 0.8 * 0.4), 1e-4); // == 0.68
    });
  });

  it("blendOverlay() — multiply below 0.5, screen above", async () => {
    await gpuTest("blendOverlay", ({ closeAbs }) => {
      // base < 0.5 branch: overlay(b, e) = 2*b*e.
      closeAbs(blendOverlay(vec3(0.2), vec3(0.5)), vec3(2 * 0.2 * 0.5), 1e-4);

      // base >= 0.5 branch (step(0.5, base) is inclusive of the edge):
      // overlay(b, e) = 1 - 2*(1-b)*(1-e).
      // The 0.5/0.5 case sits exactly on the branch boundary.
      closeAbs(blendOverlay(vec3(0.5), vec3(0.5)), vec3(1 - 2 * 0.5 * 0.5), 1e-4);
      closeAbs(blendOverlay(vec3(0.8), vec3(0.6)), vec3(1 - 2 * 0.2 * 0.4), 1e-4);

      // Overlay is continuous at the boundary: both formulas agree at base=0.5
      // only when e cancels out symmetrically, which the 0.5/0.5 case above
      // already exercises directly.
    });
  });

  it('blendColor() — standard "over" alpha compositing, non-premultiplied inputs', async () => {
    await gpuTest("blendColor", ({ closeAbs }) => {
      // Fully opaque blend layer completely replaces the base, regardless
      // of the base's own color or alpha.
      closeAbs(blendColor(vec4(0.2, 0.4, 0.6, 0.5), vec4(1, 0, 0, 1)), vec4(1, 0, 0, 1), 1e-4);

      // Fully transparent blend layer leaves the base fully unchanged.
      closeAbs(
        blendColor(vec4(0.2, 0.4, 0.6, 0.7), vec4(1, 1, 1, 0)),
        vec4(0.2, 0.4, 0.6, 0.7),
        1e-4,
      );

      // General "over" compositing: outAlpha = eA + bA*(1-eA);
      // outRGB = (e.rgb*eA + b.rgb*bA*(1-eA)) / outAlpha.
      // base = (1,0,0, 0.5), blend = (0,1,0, 0.5)
      // outAlpha = 0.5 + 0.5*0.5 = 0.75
      // outRGB = ((0,1,0)*0.5 + (1,0,0)*0.5*0.5) / 0.75 = ((0.25,0.5,0)) / 0.75
      const outAlpha = 0.75;
      const outR = (1 * 0.5 * 0.5) / outAlpha; // base.r * base.a * (1-blend.a) / outAlpha
      const outG = (1 * 0.5) / outAlpha; // blend.g * blend.a / outAlpha
      closeAbs(
        blendColor(vec4(1, 0, 0, 0.5), vec4(0, 1, 0, 0.5)),
        vec4(outR, outG, 0, outAlpha),
        1e-4,
      );
    });
  });
});
