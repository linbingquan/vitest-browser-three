/**
 * @internal
 * GPU test runner implementation.
 */

import { Node, StorageInstancedBufferAttribute } from "three/webgpu";
import type { TypedArray } from "three/webgpu";
import { Fn, If, Stack, instanceIndex, storage, vec4 } from "three/tsl";
import { getRenderer, type BackendName, resolveAvailableBackends } from "../context.ts";
import { readStorage } from "../readback.ts";
import { CANARY_VALUE, MAX_COLUMNS } from "./constants.ts";
import { getDefaultBackends } from "../config.ts";
import type { AssertionKind } from "./compare.ts";
import { compareComponents, describeFailure } from "./compare.ts";
import { cpuToNode, isNode } from "./convert.ts";
import { AssertionNode } from "./assertion-node.ts";
import { formatFloat } from "./format.ts";

/** Anything an assertion can compare against: a TSL node or a CPU-side constant. */
export type ExpectedValue = Node | number | number[] | TypedArray;

export interface GPUAssert {
  /** Assert `actual` strictly equals `expected` component-wise; NaN never equals anything, including itself. */
  eq: (actual: Node, expected: Node, message?: string) => void;
  /** Assert `actual` is within `tolerance` (absolute) of `expected` component-wise: |a - e| <= tolerance. */
  closeAbs: (actual: Node, expected: ExpectedValue, tolerance?: number, message?: string) => void;
  /** Assert `actual` is within `tolerance` (relative) of `expected` component-wise: |a - e| <= tolerance * max(|a|, |e|, 1e-12). */
  closeRel: (actual: Node, expected: ExpectedValue, tolerance?: number, message?: string) => void;
  /** Assert each component of `actual` is greater than the corresponding component of `expected`. */
  greaterThan: (actual: Node, expected: Node, message?: string) => void;
  /** Assert each component of `actual` is greater than or equal to the corresponding component of `expected`. */
  greaterThanOrEqual: (actual: Node, expected: Node, message?: string) => void;
  /** Assert each component of `actual` is less than the corresponding component of `expected`. */
  lessThan: (actual: Node, expected: Node, message?: string) => void;
  /** Assert each component of `actual` is less than or equal to the corresponding component of `expected`. */
  lessThanOrEqual: (actual: Node, expected: Node, message?: string) => void;
}

export const DEFAULT_TOLERANCE = 1e-6;

export interface GPURunOptions {
  /**
   * Upper bound on assertions per gpuTest call. Buffers are sized
   * maxAssertions * MAX_COLUMNS rows (+ canary). Default 64.
   */
  maxAssertions?: number;
  /**
   * Backends to run this suite against. Defaults to configureGPU's setting,
   * or ['webgpu', 'webgl']. Unavailable backends are soft-skipped with a
   * warning; if none are available the test fails.
   */
  backends?: BackendName[];
}

/** Implementation of gpuTest for a single backend; see gpuTest for contract. */
export async function runBackend(
  name: string,
  fn: (assert: GPUAssert) => void,
  maxAssertions: number,
  backend: BackendName,
): Promise<void> {
  const totalRows = maxAssertions * MAX_COLUMNS;
  const canaryRow = totalRows - 1;
  const maxUsableAssertions = maxAssertions - 1;

  const actualAttr = new StorageInstancedBufferAttribute(new Float32Array(totalRows * 4), 4);
  const expectedAttr = new StorageInstancedBufferAttribute(new Float32Array(totalRows * 4), 4);
  const actualStorage = storage(actualAttr, "vec4", totalRows);
  const expectedStorage = storage(expectedAttr, "vec4", totalRows);

  const renderer = await getRenderer(backend);

  // One entry per built AssertionNode. The Fn callback may be invoked several
  // times across TSL's build stages; nodes MUST be reset at the start of each
  // invocation — rebuilding is idempotent, so the last pass's bookkeeping
  // matches what actually compiled.
  const nodes: AssertionNode[] = [];

  const makeAssertion =
    (kind: AssertionKind, tolerance: number, message?: string) =>
    (actual: Node, expected: Node) => {
      if (nodes.length >= maxUsableAssertions) {
        throw new Error(
          `gpuTest "${name}": exceeded maxAssertions (${maxAssertions}); raise it via options.`,
        );
      }
      const baseRow = nodes.length * MAX_COLUMNS;

      const writeColumn = (c: number, actualVec4: Node, expectedVec4: Node) => {
        If(instanceIndex.equal(baseRow + c), () => {
          actualStorage.element(instanceIndex).assign(actualVec4);
          expectedStorage.element(instanceIndex).assign(expectedVec4);
        });
      };

      nodes.push(
        Object.assign(new AssertionNode(writeColumn, actual, expected, kind, tolerance, baseRow), {
          message,
        }),
      );
      Stack(nodes[nodes.length - 1]);
    };

  const assertAPI: GPUAssert = {
    eq: (a, e, msg) => makeAssertion("eq", 0, msg)(a, e),
    closeAbs: (a, e, tol = DEFAULT_TOLERANCE, msg) =>
      makeAssertion("closeAbs", tol, msg)(a, isNode(e) ? e : cpuToNode(e)),
    closeRel: (a, e, tol = DEFAULT_TOLERANCE, msg) =>
      makeAssertion("closeRel", tol, msg)(a, isNode(e) ? e : cpuToNode(e)),
    greaterThan: (a, e, msg) => makeAssertion("greaterThan", 0, msg)(a, e),
    greaterThanOrEqual: (a, e, msg) => makeAssertion("greaterThanOrEqual", 0, msg)(a, e),
    lessThan: (a, e, msg) => makeAssertion("lessThan", 0, msg)(a, e),
    lessThanOrEqual: (a, e, msg) => makeAssertion("lessThanOrEqual", 0, msg)(a, e),
  };

  const kernel = Fn(() => {
    nodes.length = 0;

    If(instanceIndex.equal(canaryRow), () => {
      actualStorage.element(instanceIndex).assign(vec4(CANARY_VALUE, 0, 0, 0));
    });

    fn(assertAPI);
  })().compute(totalRows);

  await renderer.computeAsync(kernel);

  // WebGL2 storage buffers are effectively single-read: read each buffer once
  // and share the arrays between the canary check and the comparisons.
  const actualData = await readStorage(renderer, actualAttr);

  const canaryActual = actualData[canaryRow * 4];
  if (Math.abs(canaryActual - CANARY_VALUE) > 1e-3) {
    throw new Error(
      `gpuTest "${name}": the compute kernel never ran (canary value missing — got ${formatFloat(canaryActual)}, expected ${formatFloat(CANARY_VALUE)}). ` +
        `This usually means the shader failed to build (invalid WGSL, e.g. a NaN or otherwise malformed literal reaching generated shader source) ` +
        `and the failure was only reported asynchronously — check the browser console for the underlying GPU compile error. ` +
        `Without the canary, every assertion would have silently compared a never-written 0 against a never-written 0 and passed.`,
    );
  }

  // Check BEFORE reading expectedStorage: with zero assertions it is never
  // written by the kernel, and reading an unwritten storage buffer trips
  // three r0.185's "reading 'size'" backend error.
  if (nodes.length === 0) {
    throw new Error(`gpuTest "${name}" contains no assertions.`);
  }

  const expectedData = await readStorage(renderer, expectedAttr);

  const failures: string[] = [];
  nodes.forEach((node, id) => {
    const actual: number[] = [];
    const expected: number[] = [];
    for (let c = 0; c < node.resolvedColumns; c++) {
      const base = (node.baseRow + c) * 4;
      actual.push(...actualData.slice(base, base + node.resolvedColumnLength));
      expected.push(...expectedData.slice(base, base + node.resolvedColumnLength));
    }

    const label = node.message || `${name} #${id}`;
    const results = compareComponents(actual, expected, node.kind, node.tolerance);
    for (const d of results) {
      if (!d.ok) {
        failures.push(describeFailure(node.kind, node.tolerance, d, label));
        break; // one line per failing assertion
      }
    }
  });

  if (failures.length > 0) {
    const dump = nodes
      .map((node, id) => {
        const actual: number[] = [];
        const expected: number[] = [];
        for (let c = 0; c < node.resolvedColumns; c++) {
          const base = (node.baseRow + c) * 4;
          actual.push(...actualData.slice(base, base + node.resolvedColumnLength));
          expected.push(...expectedData.slice(base, base + node.resolvedColumnLength));
        }
        return [
          `assertion #${id}${node.message ? ` (${node.message})` : ""} [${node.resolvedType}]`,
          `  actual  : (${actual.map(formatFloat).join(", ")})`,
          `  expected: (${expected.map(formatFloat).join(", ")})`,
        ].join("\n");
      })
      .join("\n");
    throw new Error(
      `gpuTest "${name}" failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n\n${dump}`,
    );
  }
}

/**
 * Run TSL assertions on the GPU, batching them into one compute dispatch
 * per requested backend.
 *
 * Supports scalars, vecN, mat3 and mat4. `fn` is called during graph build
 * and must be idempotent (it may run more than once). Unavailable backends
 * are soft-skipped; if none are available, the test fails.
 *
 * @param name - Test name used in error messages.
 * @param fn - Callback receiving the assertion API. May be invoked multiple
 *   times; do not rely on call count or mutate external state.
 * @param options - Optional configuration. See {@link GPURunOptions}.
 * @returns Resolves after all assertions pass on every available backend;
 *   rejects on first failure.
 *
 * @example
 * ```ts
 * await gpuTest('vec4 add', ({ eq, closeAbs }) => {
 *   eq(vec4(1, 2, 3, 4).add(vec4(10, 20, 30, 40)), vec4(11, 22, 33, 44));
 *   closeAbs(vec2(1, 2).mul(3), vec2(3, 6), 1e-6);
 * });
 * ```
 */
export async function gpuTest(
  name: string,
  fn: (assert: GPUAssert) => void,
  options: GPURunOptions = {},
): Promise<void> {
  const maxAssertions = options.maxAssertions ?? 64;
  if (!Number.isInteger(maxAssertions) || maxAssertions < 1) {
    throw new Error(
      `[vitest-browser-three] gpuTest "${name}": maxAssertions must be a positive integer.`,
    );
  }

  const requested = options.backends ?? getDefaultBackends();
  const available = await resolveAvailableBackends(requested, `gpuTest "${name}"`);

  for (const backend of available) {
    try {
      await runBackend(name, fn, maxAssertions, backend);
    } catch (error) {
      // Tag failures with the backend so multi-backend runs are diagnosable;
      // append only, so message-based regex assertions keep matching.
      const suffix = `[backend: ${backend}]`;
      if (error instanceof Error && !error.message.includes(suffix)) {
        error.message = `${error.message}\n(failed on ${suffix})`;
      }
      throw error;
    }
  }
}
