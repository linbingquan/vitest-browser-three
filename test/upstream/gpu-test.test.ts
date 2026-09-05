// Reference: three.js test/unit/addons/tsl/TSLBlendModes.tests.js (MIT)
// Ported as API validation example for gpuTest.

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

describe("gpuTest API validation", () => {
  it("blendBurn() darkens base using blend", async () => {
    await gpuTest("blendBurn", ({ closeAbs }) => {
      // A white blend layer (1) leaves the base unchanged: 1-min(1,(1-b)/1) = b.
      closeAbs(blendBurn(vec3(0.3, 0.6, 0.9), vec3(1, 1, 1)), vec3(0.3, 0.6, 0.9), 1e-4);

      // General case: burn(b, e) = 1 - min(1, (1-b)/e).
      closeAbs(blendBurn(vec3(0.5), vec3(0.5)), vec3(0), 1e-4);
      closeAbs(blendBurn(vec3(0.8), vec3(0.4)), vec3(0.5), 1e-4);
    });
  });

  it("blendDodge() lightens base using blend", async () => {
    await gpuTest("blendDodge", ({ closeAbs }) => {
      // A black blend layer (0) leaves the base unchanged.
      closeAbs(blendDodge(vec3(0.3, 0.6, 0.9), vec3(0, 0, 0)), vec3(0.3, 0.6, 0.9), 1e-4);

      // dodge(b, e) = min(b/(1-e), 1).
      closeAbs(blendDodge(vec3(0.5), vec3(0.5)), vec3(1), 1e-4);
      closeAbs(blendDodge(vec3(0.2), vec3(0.5)), vec3(0.4), 1e-4);
    });
  });

  it("blendScreen() — 1 - (1-base)*(1-blend)", async () => {
    await gpuTest("blendScreen", ({ closeAbs }) => {
      closeAbs(blendScreen(vec3(0), vec3(0)), vec3(0), 1e-6);
      closeAbs(blendScreen(vec3(1), vec3(0.5)), vec3(1), 1e-4);
      closeAbs(blendScreen(vec3(0.5), vec3(0.5)), vec3(1 - 0.5 * 0.5), 1e-4);
      closeAbs(blendScreen(vec3(0.2), vec3(0.6)), vec3(1 - 0.8 * 0.4), 1e-4);
    });
  });

  it("blendOverlay() — multiply below 0.5, screen above", async () => {
    await gpuTest("blendOverlay", ({ closeAbs }) => {
      // base < 0.5 branch: overlay(b, e) = 2*b*e.
      closeAbs(blendOverlay(vec3(0.2), vec3(0.5)), vec3(2 * 0.2 * 0.5), 1e-4);

      // base >= 0.5 branch.
      closeAbs(blendOverlay(vec3(0.5), vec3(0.5)), vec3(1 - 2 * 0.5 * 0.5), 1e-4);
      closeAbs(blendOverlay(vec3(0.8), vec3(0.6)), vec3(1 - 2 * 0.2 * 0.4), 1e-4);
    });
  });

  it("blendColor() — standard over alpha compositing", async () => {
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
