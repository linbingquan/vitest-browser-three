# vitest-browser-three

GPU-native assertions for [three.js](https://threejs.org) TSL expressions, running in
[Vitest Browser Mode](https://vitest.dev/guide/browser/).

Instead of mocking the GPU away, every assertion is compiled to a compute
shader, executed on a real GPU (WebGPU, with a WebGL2 fallback path), and the
results are read back and compared on the CPU — so failures report actual vs.
expected values instead of a bare test id.

Design decisions and platform findings are documented in
[`docs/DECISIONS.md`](./docs/DECISIONS.md) (Chinese translation in
[`docs/DECISIONS.zh.md`](./docs/DECISIONS.zh.md)), also shipped in the published package at
`node_modules/vitest-browser-three/docs/` for agent/tool consumption.

## Install

```bash
vp add three @types/three
vp add -D @vitest/browser @vitest/browser-playwright playwright vitest
```

> After installing the Vite+ tool, package-manager commands are routed
> through `vp` by default (`vp install`, `vp add`, ...).

Configure Vitest browser mode in `vite.config.ts`:

```ts
import { defineConfig } from "vitest/config"; // or "vite-plus" if you use Vite+
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          // Default: software rendering (container/CI friendly).
          // Set GPU_RENDER=hw to test on the real GPU instead.
          args: [
            "--enable-unsafe-webgpu",
            ...(process.env.GPU_RENDER?.toLowerCase() === "hw"
              ? ["--use-angle=vulkan"]
              : ["--enable-features=Vulkan", "--use-angle=swiftshader"]),
          ],
          // Some dev containers export VK_LOADER_DRIVERS_SELECT=*nvidia*,
          // which hides all other Vulkan ICDs and breaks WebGL init.
          env: { ...process.env, VK_LOADER_DRIVERS_SELECT: undefined },
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
```

## Usage

```ts
import { Matrix4 } from "three/webgpu";
import { gpuTest, gpuFuzzTest } from "vitest-browser-three";
import { float, sin, vec3, vec4, mat4 } from "three/tsl";

// Declarative assertions — one batched compute dispatch per suite.
await gpuTest("vector math", ({ eq, closeAbs, greaterThan }) => {
  eq(float(2).add(3), float(5));
  closeAbs(sin(float(Math.PI / 2)), float(1), 1e-3);
  greaterThan(vec3(5, 6, 7).length(), float(10));
});

// CPU-side constants are accepted directly by the comparison methods.
await gpuTest("scalar math", ({ closeRel }) => {
  closeRel(sin(float(Math.PI / 2)), 1);
});

// Fuzzing: deterministic inputs, one compute dispatch for all instances.
await gpuFuzzTest("sin", {
  instances: 128,
  input: (i) => (i / 128) * Math.PI * 2,
  test: (x) => sin(x),
  expected: (x) => Math.sin(x),
  tolerance: 1e-3, // SwiftShader fast-math sin has ~1e-5 relative error
});
```

### Matrices

```ts
await gpuTest(
  "rotation",
  ({ closeAbs }) => {
    const angle = Math.PI / 2;
    const rot = mat4(new Matrix4().makeRotationZ(angle));
    closeAbs(rot.mul(vec4(1, 0, 0, 1)), vec4(0, 1, 0, 1), 1e-6);
  },
  { maxAssertions: 8 }, // each matrix assertion occupies a 4-row stride
);
```

### Multi-backend

Suites run against both backends by default (`'webgpu'` and `'webgl'` — the
latter is `WebGPURenderer` with `forceWebGL: true`). Unavailable backends are
soft-skipped with a warning; the test only fails when no requested backend is
available. Failures are tagged with `[backend: xxx]`.

```ts
await gpuTest("smoke", ({ eq }) => eq(float(2).add(3), float(5)), {
  backends: ["webgpu", "webgl"],
});
configureGPU({ backends: ["webgpu"] }); // library-wide default

const ok = await isBackendAvailable("webgl"); // manual probing
```

> Note: `configureGPU` mutates global state — prefer per-call `backends`
> options when running test files in parallel.

## Assertion semantics

| Method                                                          | Comparison                                    |
| --------------------------------------------------------------- | --------------------------------------------- |
| `eq(a, b)`                                                      | exact component equality (`NaN !== NaN`)      |
| `closeAbs(a, b, tol)`                                           | `\|a - e\| <= tol`                            |
| `closeRel(a, b, tol)`                                           | `\|a - e\| <= tol * max(\|a\|, \|b\|, 1e-12)` |
| `greaterThan / greaterThanOrEqual / lessThan / lessThanOrEqual` | component-wise relational                     |

Supported value types: scalar, vecN, mat3, mat4. Type resolution happens at
shader build time; mismatched types throw.

`closeAbs` and `closeRel` accept either a TSL node or a CPU-side constant
(`number`, `number[]`, `TypedArray`) as `expected`.

### Cleanup

The default entry (`vitest-browser-three`) disposes the shared GPU renderer
automatically via `afterAll` — if you want automatic cleanup with no extra
setup, import from the default entry. If you import the side-effect-free API
from `vitest-browser-three/pure`, add one line to your Vitest setup file
instead:

```ts
import { afterAll } from "vitest";
import { disposeRenderer } from "vitest-browser-three/pure";

afterAll(async () => {
  await disposeRenderer();
});
```

```ts
// vite.config.ts
test: {
  setupFiles: ["./my-gpu-setup.ts"];
}
```

## Known limitations & quirks (three r0.185)

- Creating a storage node that is never used inside a kernel breaks backend
  buffer registration for attributes that _are_ used.
- WebGL2 storage buffers are effectively single-read; we read each buffer once
  and share the arrays between the canary check and comparisons.
- `TSL mat4(Matrix4)` transposes relative to `Matrix4.elements`.
- SwiftShader's fast-math trig has ~1e-5 relative error — use tolerances of
  1e-4 ~ 1e-3 for transcendental functions.

## Upstream tracking

This library's design follows three.js PR
[#34331](https://github.com/mrdoob/three.js/pull/34331)
(`gpu-test-utils.js`, prototype). Tracking strategy:

- **We maintain our own implementation** and absorb upstream design ideas
  (canary detection, bare-instanceIndex addressing, AssertWriteNode-style type
  resolution) rather than depending on prototype code that is deeply coupled
  to QUnit.
- When/if the upstream graduates into an official API, re-evaluate switching
  to it or providing a compatibility layer. Watch for new commits touching
  `test/unit/addons/tsl/gpu-test-utils.js` in three.js.

Full alignment decisions and platform findings are recorded in
[docs/DECISIONS.md](./docs/DECISIONS.md) (English version is authoritative;
a Chinese translation lives at
[docs/DECISIONS.zh.md](./docs/DECISIONS.zh.md)).

## Development

```bash
vp install   # also enables the git hooks
vp check     # format + lint + typecheck
vp test      # browser-mode tests (requires playwright chromium)
vp run build
```

Running `vp install` configures a pre-commit hook (via Vite+'s `prepare`
script) that requires `docs/DECISIONS.md` and its Chinese translation
`docs/DECISIONS.zh.md` to be updated in the same commit. The hook only takes
effect after that initial install; before then, git has no hook configured for
this repository.

### GPU rendering mode

By default tests render with Chrome's bundled SwiftShader (CPU), which works
in restricted containers and CI. On a machine with a working hardware Vulkan
driver, use:

```bash
GPU_RENDER=hw vp test   # case-insensitive; runs on the real GPU via ANGLE Vulkan
```

Limitations:

- `GPU_RENDER=hw` requires a working hardware Vulkan ICD; Chrome headless
  otherwise silently falls back to SwiftShader even on GPU-equipped machines.
- On machines without a usable hardware GPU, hw mode makes WebGL-only tests
  fail (the default software mode keeps all tests passing).
- Native WebGPU is not exercised in headless mode (Playwright's headless shell
  does not expose `navigator.gpu`); the `webgpu` backend is soft-skipped, so
  only the `webgl` backend actually runs.

## License

MIT
