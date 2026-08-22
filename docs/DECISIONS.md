# Design Decisions & Platform Findings

> A Chinese translation of this document is available at
> [`DECISIONS.zh.md`](./DECISIONS.zh.md). The English version is
> authoritative.

> This document records important decisions and empirical platform quirks
> encountered during development, so we don't re-investigate them later.
> The project is currently an unpublished single-maintainer effort; we use
> a lightweight single document instead of full ADR. If the contributor base
> grows, this can be upgraded to an ADR directory.

## Upstream alignment

Reference upstream: three.js PR [#34331](https://github.com/mrdoob/three.js/pull/34331)
prototype `gpu-test-utils.js` (QUnit-based).

| Aspect                           | three.js PR #34331                           | Our choice                                  | Rationale                                                             |
| -------------------------------- | -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| gpuFuzzTest shape                | `(name, count, buildFn, options)` positional | `(name, spec)` object                       | Self-documenting; CPU reference values are central to our purpose     |
| Fuzz input generation            | GPU-side `hash(instanceIndex)`               | CPU deterministic function → storage buffer | Supports arbitrary distributions; matches CPU expected function model |
| Per-instance multiple assertions | site budget (`maxSitesPerInstance`)          | single `test` expression                    | Avoids WebGL2 transform-feedback buffer budget issues                 |
| message parameter                | yes                                          | yes                                         | Implemented, tested, and documented                                   |

**Overall strategy**: maintain our own implementation, absorb upstream design
ideas (canary detection, bare-instanceIndex addressing, AssertWriteNode-style
type resolution), and do not depend on prototype code deeply coupled to QUnit.
We monitor commits touching `test/unit/addons/tsl/gpu-test-utils.js` and will
re-evaluate switching or providing a compatibility layer once the upstream
graduates into an official API. (Empirically, the prototype commit `5132c1fa`
has had zero evolution so far.)

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

### Canary silent failure detection

- **Finding**: when a shader fails to build (e.g., NaN literal reaching
  generated WGSL), `computeAsync` may **not reject**, only logging an async
  console error; all buffers read back zero-initialized, causing every
  assertion to silently pass as 0-vs-0.
- **Decision**: reserve one row for an unconditional canary `12345.6789`,
  check it after readback, and throw a detailed error if missing. WebGL2
  storage buffers are effectively single-read, so the canary and data
  comparisons share the same readback array.

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
  (`Math.fround`), matching what the GPU actually gets; (2) fuzz sweeps use
  half-step sampling (`(i + 0.5) / n`) so inputs never land exactly on
  discontinuities; (3) CPU references must compare against f32-rounded
  constants (`Math.fround(0.15)`, not `0.15`) when mirroring shader literals.

### Real-world snippet coverage

Current snippets: band shading (Fn/step/abs/mix/color), animated
edge-distorted stripes (uv/time/distance/fract/negate), If/Else conditional
color selection, and stylized rim-lit shading
(normalize/dot/max/pow/smoothstep/clamp with a three-vec3 Fn).

Acceptance criteria for new snippets: they must cover compilation modes not
yet exercised, and geometry/render-context nodes (positionLocal, uv, time)
must be refactored into explicit parameters.

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

## Test classification

- Pure math/expression tests (`test/math.test.ts`)
- Real-world snippets (`test/real-world.test.ts`) — acceptance: covers new
  compilation modes; geometry/context nodes refactored into explicit params
- Multi-backend & probing tests (`test/backend.test.ts`)
- Canary regression (`test/canary.test.ts`)

### Type-safety governance for three internals

- Minimal structural interfaces for untyped three APIs live in
  `src/three-internals.ts` (single source of truth for our assumptions).
- `AssertionNode.setup` types its builder as
  `NodeBuilderLike & Parameters<Node["getNodeType"]>[0]` instead of
  deep-importing three's internal NodeBuilder class (fragile across minor
  versions and conflicts with the externalization policy).

## Dependency strategy

- `three` and `vitest` / `@vitest/*` are always external and never inlined
  (a setup.ts import of vitest once caused vp pack to auto-inline vitest
  internals; fixed).
- `three >=0.185.0` and `vitest >=4.0.0` are declared as peerDependencies;
  the setup subpath imports vitest at runtime, so consumers must have vitest
  installed directly.

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
