import { describe, it, afterAll } from "vitest";
import { type Node, Color } from "three/webgpu";
import {
  Fn,
  If,
  abs,
  clamp,
  color,
  distance,
  dot,
  float,
  fract,
  max,
  mix,
  normalize,
  pow,
  smoothstep,
  step,
  vec3,
} from "three/tsl";
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
      input: (i) => ((i + 0.5) / 100) * 0.6 - 0.3, // y in [-0.3, 0.3], half-step avoids the |y| == 0.15 threshold
      test: (y) => bandColor(y),
      expected: (y) => {
        // step(edge=|y|, x=f32(0.15)): compare against the f32 constant
        const v = Math.fround(0.15) >= Math.abs(y) ? 1 : 0;
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

// Second real-world snippet: edge-distorted animated hard-edge stripes along
// X. uv() and time are render-context nodes with no meaning in a compute
// dispatch, so they are refactored into explicit u/v/t parameters.
const black = new Color(0x000000);
const yellow = new Color(0xffff00);

const fractCpu = (x: number) => x - Math.floor(x); // GPU fract is always in [0, 1)
const stepCpu = (edge: number, x: number) => (x >= edge ? 1 : 0);

const stripeColor = Fn(([u, v, t]: [any, any, any]) => {
  const edgeWeight = distance(v, float(0.5)).mul(2.0);
  const edgeOffsetX = edgeWeight.mul(0.5);
  const timeOffset = t.mul(0.2).negate();
  const animatedX = edgeOffsetX.add(u).add(timeOffset);
  const stripePattern = fract(animatedX.mul(5.0).div(2.0));
  const stripeMask = step(float(0.5), stripePattern);
  return mix(color(0x000000), color(0xffff00), stripeMask);
});

describe("real-world snippets: animated stripes", () => {
  afterAll(async () => {
    await disposeRenderer();
  });

  it("stripe boundaries with explicit u/v/t", async () => {
    await gpuTest(
      "stripe-boundaries",
      ({ closeRel }) => {
        // v=0.5 -> no distortion, t=0: u=0 -> fract(0)=0 -> step=0 -> black
        closeRel(stripeColor(float(0.0), float(0.5), float(0.0)), [black.r, black.g, black.b]);
        // same row: u=0.2 -> animatedX*5/2 = 0.5 -> step(0.5, 0.5)=1 -> yellow
        closeRel(stripeColor(float(0.2), float(0.5), float(0.0)), [yellow.r, yellow.g, yellow.b]);
        // v=0 -> max distortion (offset +0.5): u=0 -> fract(1.25)=0.25 -> black
        closeRel(stripeColor(float(0.0), float(0.0), float(0.0)), [black.r, black.g, black.b]);
        // animation: t=1 shifts u by -0.2 -> the yellow stripe moves to u=0.4
        closeRel(stripeColor(float(0.4), float(0.5), float(1.0)), [yellow.r, yellow.g, yellow.b]);
      },
      { maxAssertions: 8 },
    );
  });

  it("stripe sweep over u matches CPU reference (fract/step semantics)", async () => {
    await gpuFuzzTest("stripe-sweep-u", {
      instances: 100,
      input: (i) => ((i + 0.5) / 100) * 2 - 1, // u in [-1, 1], half-step avoids u * 2.5 landing on integers (fract discontinuities)
      test: (u) => stripeColor(u, float(0.5), float(0.0)),
      expected: (u) => {
        const pattern = fractCpu((u * 5) / 2);
        const mask = stepCpu(0.5, pattern);
        return [
          black.r + (yellow.r - black.r) * mask,
          black.g + (yellow.g - black.g) * mask,
          black.b + (yellow.b - black.b) * mask,
        ];
      },
      tolerance: 1e-6,
    });
  });
});

// Third real-world snippet (mentor-designed): stylized rim-lit shading.
// Blinn-Phong specular + Fresnel-style rim + stylized two-color mixing,
// covering normalize/dot/max/pow/smoothstep/clamp/abs in one function.
const blue = new Color(0x2a4d6e);
const orange = new Color(0xf4a261);

const smoothstepCpu = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Vec3 = [number, number, number];
function rimLitCpu(n: Vec3, l: Vec3, v: Vec3): Vec3 {
  const norm = (a: Vec3): Vec3 => {
    const len = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / len, a[1] / len, a[2] / len];
  };
  const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const N = norm(n);
  const L = norm(l);
  const V = norm(v);

  const ndl = Math.max(dot3(N, L), 0);
  const H = norm([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);
  const spec = Math.pow(Math.max(dot3(N, H), 0), 32);
  const rim = smoothstepCpu(0.3, 0.7, 1 - Math.abs(dot3(N, V)));
  const shade = clamp01(ndl * 0.8 + spec * 0.6 + rim * 0.4);

  return [
    blue.r + (orange.r - blue.r) * shade,
    blue.g + (orange.g - blue.g) * shade,
    blue.b + (orange.b - blue.b) * shade,
  ];
}

const rimLit = Fn(([n, l, v]: [Node<"vec3">, Node<"vec3">, Node<"vec3">]) => {
  const N = normalize(n);
  const L = normalize(l);
  const V = normalize(v);
  const ndl = max(dot(N, L), 0.0);
  const H = normalize(L.add(V));
  const spec = pow(max(dot(N, H), 0.0), 32.0);
  const rim = smoothstep(0.3, 0.7, float(1).sub(abs(dot(N, V))));
  const shade = clamp(ndl.mul(0.8).add(spec.mul(0.6)).add(rim.mul(0.4)), 0.0, 1.0);
  return mix(color(0x2a4d6e), color(0xf4a261), shade);
});

describe("real-world snippets: stylized rim-lit shading", () => {
  afterAll(async () => {
    await disposeRenderer();
  });

  it("rim-lit boundaries match CPU reference", async () => {
    await gpuTest(
      "rim-lit-boundaries",
      ({ closeRel }) => {
        const n = vec3(0, 0, 1);
        const v = vec3(0, 0, 1);
        // light facing the normal: fully lit
        closeRel(rimLit(n, vec3(0, 0, 1), v), rimLitCpu([0, 0, 1], [0, 0, 1], [0, 0, 1]), 1e-5);
        // light perpendicular
        closeRel(rimLit(n, vec3(1, 0, 0), v), rimLitCpu([0, 0, 1], [1, 0, 0], [0, 0, 1]), 1e-5);
        // light on the other side: N·L = 0
        closeRel(rimLit(n, vec3(0, 1, 0), v), rimLitCpu([0, 0, 1], [0, 1, 0], [0, 0, 1]), 1e-5);
        // normal facing away from view: rim term dominates
        closeRel(
          rimLit(vec3(0, 0, -1), vec3(0, 0, 1), v),
          rimLitCpu([0, 0, -1], [0, 0, 1], [0, 0, 1]),
          1e-5,
        );
      },
      { maxAssertions: 8 },
    );
  });

  it("rim-lit sweep over light z matches CPU reference", async () => {
    await gpuFuzzTest("rim-lit-sweep", {
      instances: 100,
      input: (i) => ((i + 0.5) / 100) * 2 - 1, // z in (-1, 1)
      test: (z) => rimLit(vec3(0, 0, 1), vec3(0.5, 0.5, z), vec3(0, 0, 1)),
      expected: (z) => rimLitCpu([0, 0, 1], [0.5, 0.5, z], [0, 0, 1]),
      tolerance: 1e-4, // SwiftShader normalize/pow/smoothstep error
    });
  });
});
