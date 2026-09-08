# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.4] - 2026-09-09

### Added

- `resetDefaultBackends()` function to restore library-wide default backends.
- Public export of `getDefaultBackends()` for retrieving the current default backend configuration.

### Changed

- `GPUAssert` methods (`eq`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`) now accept `ExpectedValue` (`Node | number | number[] | TypedArray`) instead of only `Node`, enabling direct CPU constant comparisons.
- `configureGPU` now validates backend names, throwing an error for unsupported values.
- Installation commands in README and user guide unified to use `npm install -D` consistently.

### Fixed

- Corrected scalar broadcast in `padToVec4` when `count === 1`; scalar values now broadcast to all four components instead of only the first.
- `rawComputeTest` now soft-skips tests when the backend does not provide feature detection (`typeof renderer.hasFeature !== "function"`), matching the documented behavior.
- Canary value is now randomized per test × backend invocation, preventing stale-kernel false positives on the WebGL2 fallback.
- Improved error messages with defensive checks and accurate formatting.
- Test stability improvements: WebGPU-only tests are skipped when WebGPU is unavailable, and backend configuration tests no longer mutate global state.

### Refactored

- Replaced unsafe `as never` type assertions with typed checks.
- Removed duplicate code and redundant logging.
- Improved readability in `AssertionNode` by extracting a `SetupBuilder` type alias and removing the redundant `isMatrix` variable.

### Documentation

- Added Pure API guide and corresponding README section.
- Synchronized `requiredFeature` behavior and canary error examples with implementation.
- Added half-step sampling guidance and consolidated examples.
- Updated API reference for new types and signatures.
- Corrected platform notes and backend failure message format.
- Clarified that `pure` entry functions like `configureGPU` still mutate global state when called.

## [0.0.3] - 2026-09-06

### Added

- `gpuFuzzTest` now supports an `absolute` tolerance option for comparing values using absolute error (`|a - e| <= tolerance`) instead of relative error. This is useful for periodic functions like `sin` and `cos` where f32/f64 precision differences can cause relative tolerance to fail near zero crossings.

### Changed

- Relaxed `peerDependencies` ranges: `three >=0.185.0` and `vitest >=4.0.0`, allowing users more upgrade flexibility.
- Documentation examples now include explicit vitest imports (`it`, `expect`) for a better copy-paste experience.
- Improved type annotations in code examples (e.g., `WebGPURenderer`).

### Fixed

- Corrected the WebGPU feature name in raw-compute examples (`subgroups`).
- Removed an unnecessary unsigned conversion (`>>> 0`) in the atomic bitwise operations example.

## [0.0.2] - 2026-09-06

### Added

- `rawComputeTest`: Low-level GPU compute testing API with full control over dispatch shape, shared/atomic memory, and inspection of workgroup/subgroup identity values.
- `readUintBuffer` / `readIntBuffer`: Integer buffer readback functions for reading `uint` and `int` storage buffers, preserving exact integer values. These functions require explicitly passing the underlying storage attribute (`node.value`) rather than the TSL node itself, providing compile-time type safety.
- User documentation published with the package: `docs/guide/` now contains a complete user guide, API reference, and runnable examples.

### Changed

- Streamlined `README.md` to keep the quick start and feature overview, moving detailed content to `docs/guide/`.
- Updated internal `docs/DECISIONS.md` with the latest design decisions.
- Restructured the test suite by API functionality to improve maintainability.

## [0.0.1] - 2026-08-23

### Added

- Initial release.
- `gpuTest` / `gpuFuzzTest`: GPU-native assertions for three.js TSL expressions.
- Assertions run as compute shaders on real backends (WebGPU, with WebGL2 fallback), with results read back and compared on the CPU.
- Dual entry points: default (`vitest-browser-three`, with automatic GPU cleanup) and side-effect-free (`vitest-browser-three/pure`).
- Multi-backend support with soft-skipping when a backend is unavailable.

[0.0.4]: https://github.com/linbingquan/vitest-browser-three/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/linbingquan/vitest-browser-three/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/linbingquan/vitest-browser-three/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/linbingquan/vitest-browser-three/releases/tag/v0.0.1
