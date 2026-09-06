/**
 * GPU-native assertions for three.js TSL expressions.
 *
 * This module provides the public API for running GPU-accelerated assertions.
 * For internal implementation details, see src/assert/.
 */

// Re-export public types and functions
export type { ExpectedValue, GPUAssert, GPURunOptions } from "./assert/runner.ts";
export { DEFAULT_TOLERANCE, gpuTest } from "./assert/runner.ts";
export { toVec4, cpuToNode, isNode } from "./assert/convert.ts";
