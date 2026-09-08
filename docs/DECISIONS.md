# Design Decisions & Platform Findings

> 中文译本：[`DECISIONS.zh.md`](./DECISIONS.zh.md) — English version is authoritative.

> This document records important decisions and empirical platform quirks
> encountered during development, so we don't re-investigate them later.
> The project is currently an unpublished single-maintainer effort; we use
> a lightweight single document instead of full ADR. If the contributor base
> grows, this can be upgraded to an ADR directory.

## Upstream alignment

Reference upstream: three.js prototype GPU test utilities (QUnit-based), currently at:

- [`gpu-test-utils.js`](https://github.com/mrdoob/three.js/blob/dev/test/unit/addons/tsl/gpu-test-utils.js) — `gpuTest` / `gpuFuzzTest`
- [`gpu-raw-test-utils.js`](https://github.com/mrdoob/three.js/blob/dev/test/unit/addons/tsl/gpu-raw-test-utils.js) — `rawComputeTest`

| Aspect                           | Upstream                                                                                            | Our choice                                                               | Rationale                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| gpuFuzzTest shape                | `(name, count, buildFn, options)` positional                                                        | `(name, spec)` object                                                    | Self-documenting; CPU reference values are central to our purpose                        |
| Fuzz input generation            | GPU-side from `instanceIndex` (buildFn receives the instance index; inputs are derived by the user) | CPU deterministic function → storage buffer                              | Supports arbitrary distributions; matches CPU expected function model                    |
| Per-instance multiple assertions | site budget (`maxSitesPerInstance`)                                                                 | single `test` expression                                                 | Avoids WebGL2 transform-feedback buffer budget issues                                    |
| message parameter                | yes                                                                                                 | yes                                                                      | Implemented, tested, and documented                                                      |
| Backend configuration            | Per-call `backends` option only                                                                     | `configureGPU({ backends })` for library-wide defaults + per-call option | More convenient for suites with a fixed backend policy                                   |
| Renderer lifecycle               | Shared cache, no automatic cleanup                                                                  | Shared cache + auto-dispose via `afterAll` in main entry                 | Reduces boilerplate; pure entry remains opt-in for manual control                        |
| Canary value generation          | Random per test × backend (`randomCanaryValue()`)                                                   | Random per test × backend (`randomCanaryValue()`)                        | Adopted upstream strategy to prevent stale-kernel false positives on the WebGL2 fallback |
| gpuFuzzTest matrix support       | Opt-in via `maxColumnsPerSite` (default 1; 3/4 for mat3/mat4)                                       | Not supported (only 1–4 components via `padExpected`)                    | Avoid WebGL2 buffer budget; keep API simple                                              |
| rawComputeTest context           | `{ assert, renderer }` (includes QUnit assert object)                                               | `{ renderer }` (caller uses Vitest's `expect`)                           | Framework-agnostic; caller controls assertion style                                      |

**Overall strategy**: maintain our own implementation, absorb upstream design
ideas (canary detection, bare-instanceIndex addressing, AssertWriteNode-style
type resolution), and do not depend on prototype code deeply coupled to QUnit.
We monitor commits touching `test/unit/addons/tsl/gpu-test-utils.js` and
`test/unit/addons/tsl/gpu-raw-test-utils.js`, and will re-evaluate switching
or providing a compatibility layer once the upstream graduates into an
official API. (Empirically, the upstream prototype has had minimal
evolution so far.)

## Platform findings

### WebGL2 transform-feedback addressing constraint

- **Finding**: any write target other than the bare `instanceIndex` node
  (arithmetic offsets, JS constant indices) collapses to slot 0.
- **Impact**: batch dispatch must use `If(instanceIndex.equal(row), ...)`.
  When exactly one instance is dispatched per pass (e.g., the old
  single-call gpuTest) `instanceIndex` is always 0, so constant indexing must
  be used — the two patterns must not be mixed; choose according to dispatch
  structure.

### three r0.185 unused storage node breaks buffer registration

- **Finding**: creating a storage node that is never used inside a kernel
  causes backend buffer registration to fail for other used attributes
  (`getArrayBufferAsync` throws `'size' of undefined`).
- **Impact**: gpuTest's empty-assertion guard must run **before** reading
  `expectedStorage`, because with zero assertions that buffer is never written
  by the kernel.

### TSL `mat4(Matrix4)` transpose difference

- **Finding**: TSL's `mat4(Matrix4)` is transposed relative to
  `Matrix4.elements` (column-major).
- **Impact**: matrix tests should verify through transformation behavior
  (e.g., transformed vectors), not raw element comparison.

### TSL `compute` dispatch parameter semantics

- **Finding**: `node.compute(totalInvocations, [workgroupSize])` — the first
  argument is the **total number of invocations/instances**, not the number of
  workgroups. `instanceIndex` ranges from `0` to `totalInvocations - 1`.
  The optional second argument groups threads into workgroups; omit it or
  use `[1]` for single-thread-per-workgroup dispatch.
- **Impact**: tests like `rawComputeTest` that verify cross-workgroup atomicity
  should keep `totalInvocations` equal to the expected call count and use
  `[workgroupSize]` to control grouping.
- **Upstream reference**: three.js `GPUAtomicsStorage.tests.js` uses
  `.compute(dispatchCount, [WORKGROUP_SIZE])` throughout, with assertions
  expecting `dispatchCount` (not `dispatchCount * WORKGROUP_SIZE`).

### Canary silent failure detection

- **Finding**: when a shader fails to build (e.g., NaN literal reaching
  generated WGSL), `computeAsync` may **not reject**, only logging an async
  console error; all buffers read back zero-initialized, causing every
  assertion to silently pass as 0-vs-0.
- **Decision**: reserve one row for an unconditional canary, generated
  randomly per test × backend invocation (`randomCanaryValue()`). Check it
  after readback using strict equality (`===`). WebGL2 storage buffers are
  effectively single-read, so the canary and data comparisons share the same
  readback array.
- **Upstream note**: Upstream identified and reproduced a stale-kernel
  vulnerability with fixed constant canaries on the WebGL2 fallback. We have
  adopted the same random-canary strategy (`randomCanaryValue()`) to close
  that gap.

### TSL `color()` node type normalization

- **Finding**: `color(hex)` produces a node whose resolved type is `"color"`,
  not `"vec3"`, even though it behaves as vec3 in shaders.
- **Decision**: AssertionNode normalizes `"color"` to `"vec3"` before type
  comparison, so `closeRel(colorNode, [r, g, b])` works directly.

### fp32/f64 divergence at discontinuities (fuzz reference values)

- **Finding**: fuzz inputs are rounded to f32 for the GPU upload, but the CPU
  reference was computed from the f64 value. Near `fract`/`step` thresholds
  the two can land on opposite sides of a discontinuity and fail even though
  both are "correct".
- **Decision**: (1) `expected(x, i)` receives the f32-rounded input
  (`Math.fround`), matching what the GPU actually gets; (2) CPU references
  must compare against f32-rounded constants (`Math.fround(0.15)`, not
  `0.15`) when mirroring shader literals; (3) users are advised to use
  half-step sampling (`(i + 0.5) / n`) when sweeping near discontinuities
  (`fract`, `step`) so inputs never land exactly on them — this is a
  recommendation in the guide, not enforced by the library.

### Real-world snippet coverage

Planned snippets (not yet implemented):

- band shading (Fn/step/abs/mix/color)
- animated edge-distorted stripes (uv/time/distance/fract/negate)
- If/Else conditional color selection
- stylized rim-lit shading (normalize/dot/max/pow/smoothstep/clamp with a three-vec3 Fn)

Acceptance criteria for new snippets: they must cover compilation modes not
yet exercised, and geometry/render-context nodes (positionLocal, uv, time)
must be refactored into explicit parameters.

## Plugin & fixture extensibility

- The current assertion set (eq/closeAbs/closeRel/relational) is closed and
  sufficient for the initial release.
- A future plugin system for custom comparison kinds is feasible without any
  GPU-side changes: all comparisons happen on the CPU after readback, so it
  reduces to converting `compareComponents`/`describeFailure` into a
  registry (light-to-medium effort).
- A Vitest fixture extension (`test.extend()`) is feasible by wrapping
  `gpuTest` into a harness factory (`createGpuHarness()` returning
  assert/run/dispose); the renderer singleton can be made injectable if a
  fixture needs isolated instances (medium effort).
- Neither extension forces a breaking change of the existing `gpuTest`
  signature, so no groundwork is needed now.

## Multi-backend strategy

- Suites default to both backends: `['webgpu', 'webgl']` (the latter is
  `WebGPURenderer` with `forceWebGL: true`).
- Unavailable backends are soft-skipped with a `console.warn`; the test only
  fails when no requested backend is available.
- `configureGPU({ backends })` sets library-wide defaults; per-call `backends`
  options take precedence.
- Backend-scoped failures append a `[backend: xxx]` tag to error messages
  (append-only, so message-based regex assertions keep matching).

## Renderer caching

- Renderers are cached per backend; failed init is remembered (`failed`
  flag) so probes stay cheap.
- A non-rethrowing `.catch` on the cached promise marks failure and logs,
  while preserving the original rejection for the first caller — later calls
  throw synchronously via the `failed` flag (no unhandledrejection noise).

## Raw compute buffer readback

- **Decision**: integer readback helpers require the storage attribute
  (`node.value`), not the TSL node itself. This gives compile-time safety
  and keeps the helper's responsibility single; unlike the untyped upstream
  prototype, we do not auto-unwrap nodes. Callers explicitly pass `.value`.
- **Decision**: when `requiredFeature` is set and the renderer does not
  support it (`renderer.hasFeature(...)` returns false), **or the backend
  does not provide feature detection** (`typeof renderer.hasFeature !== "function"`,
  e.g. WebGL fallback), the test is soft-skipped with a
  warning instead of failing. This keeps `subgroups` and other
  feature-dependent tests portable across backends and CI environments.

## Test classification

- Pure math/expression tests (`test/math.test.ts`)
- Multi-backend & probing tests (`test/backend.test.ts`)
- Canary regression (`test/canary.test.ts`)
- Raw compute & integer readback tests (`test/raw-compute.test.ts`)

### Type-safety governance for three internals

- Minimal structural interfaces for untyped three APIs live in
  `src/three-internals.ts` (single source of truth for our assumptions).
- `AssertionNode.setup` types its builder as
  `NodeBuilderLike & Parameters<Node["getNodeType"]>[0]` instead of
  deep-importing three's internal NodeBuilder class (fragile across minor
  versions and conflicts with the externalization policy).

## Dependency strategy

- `three` and `vitest` / `@vitest/*` are always external and never inlined
  (an early entry importing vitest once caused vp pack to auto-inline vitest
  internals; fixed).
- `three >=0.185.0` and `vitest >=4.0.0` are declared as peerDependencies;
  the library imports vitest at runtime, so consumers must have vitest
  installed directly.
- `pack.exports` auto-generation is disabled: tsdown's experimental exports
  metadata rewrites the package.json `exports` map without the `"types"`
  conditions, breaking TypeScript consumers under node16/nodenext/bundler
  resolution. The exports map is hand-maintained instead; revisit only if a
  future tsdown preserves existing conditions.

## Tolerance semantics

- `closeRel` uses the standard relative formula
  `|a - e| <= tolerance * max(|a|, |e|, 1e-12)`.
  This was chosen over the earlier floor-1 formula
  (`tolerance * max(1, |e|)`) because it behaves consistently for values
  smaller than 1: the floor-1 formula effectively became an absolute
  tolerance for small inputs, which was surprising and harder to reason
  about. The standard formula is also what most testing libraries use for
  relative comparisons.
- `closeAbs` remains available for explicit absolute tolerance.
- CPU constants can be passed directly to `closeAbs` / `closeRel`; they are
  converted internally via `cpuToNode()`.
- `gpuFuzzTest` defaults to relative tolerance (same formula as `closeRel`).
  It also accepts `absolute: true` to switch to absolute tolerance
  (`|a - e| <= tolerance`).

  Motivation: relative tolerance fails near zero crossings for periodic
  functions. For example, `sin(f32(π))` returns a value very close to 0 on
  the GPU, while `Math.sin(f32(π))` returns `-8.74e-8` in f64 on the CPU.
  With relative tolerance, the allowed error near zero is
  `tolerance * 1e-12` (due to `ZERO_FLOOR`), which is far smaller than the
  actual f32/f64 discrepancy, causing false failures. Absolute tolerance
  avoids this by comparing the raw difference against the tolerance value.
