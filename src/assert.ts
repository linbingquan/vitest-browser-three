import type { Node } from "three/webgpu";
import { StorageInstancedBufferAttribute, type TypedArray } from "three/webgpu";
import { Fn, If, storage, instanceIndex, float, vec2, vec3, vec4 } from "three/tsl";
import { getRenderer } from "./context.ts";
import { readStorage } from "./readback.ts";

export interface GPUAssert {
  /** Assert `actual` equals `expected` on the GPU, component-wise within `tolerance`. */
  expectClose: (actual: Node, expected: Node, tolerance?: number) => void;
  /** Assert `actual` equals a CPU-side constant value (number, array, or flat TypedArray). */
  expectValue: (actual: Node, expected: number | number[] | TypedArray, tolerance?: number) => void;
  /** Alias of `expectClose`. */
  expect: (actual: Node, expected: Node, tolerance?: number) => void;
}

interface AssertionRow {
  actual: Node;
  expected: Node;
  tolerance: number;
  /** 1-based index of the `expect*()` call, for error messages. */
  index: number;
}

export const DEFAULT_TOLERANCE = 1e-6;

/** Force evaluation of a TSL expression into a variable (node.toVar()). */
function toVar(node: Node): Node {
  const n = node as unknown as { toVar?: () => Node };
  if (typeof n.toVar !== "function") {
    throw new Error(
      `[vitest-browser-three] Unsupported node for GPU assertion: node has no toVar() method (got ${node.constructor?.name ?? typeof node}).`,
    );
  }
  return n.toVar();
}

// Written unconditionally into a reserved row of the actual buffer. If the
// kernel fails to build (e.g. a NaN literal reaching generated WGSL),
// computeAsync may not reject at all — it just reports asynchronously — and
// every buffer reads back zero-initialized, so all assertions would silently
// compare 0 against 0 and pass. The canary's absence proves the dispatch
// never ran and lets us fail loudly instead (same strategy as three.js
// PR #34331's gpu-test-utils).
const CANARY_VALUE = 12345.6789;

/**
 * Convert any scalar/vector TSL node to vec4 so every assertion occupies one
 * storage row. Both sides of an assertion go through the exact same
 * conversion, so padding/broadcast components always match — as long as
 * actual and expected have the same type.
 */
export function toVec4(node: Node): Node {
  const n = node as unknown as { toVec4?: () => Node; type?: string };
  if (typeof n.toVec4 !== "function") {
    throw new Error(
      `[vitest-browser-three] Unsupported node for GPU assertion: only scalar/vector nodes are supported (got ${node.constructor?.name ?? typeof node}).`,
    );
  }
  return n.toVec4();
}

function formatFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

function formatRow(name: string, data: Float32Array): string {
  return `  ${name}: vec4(${Array.from(data, formatFloat).join(", ")})`;
}

/**
 * Run TSL assertions on the GPU via a single batched compute dispatch.
 *
 * Each `expect*()` call inside `fn` becomes one assertion row; one extra row
 * is reserved for a canary that detects kernels which never ran (see
 * CANARY_VALUE). All rows are written via bare `instanceIndex` addressing
 * guarded by `If(instanceIndex.equal(row), ...)` — the only write pattern the
 * WebGL2 transform-feedback fallback supports — so a single dispatch serves
 * both backends. Results are read back once and compared with relative
 * tolerance on the CPU.
 *
 * Note: the callback runs synchronously (TSL graph building is sync); only
 * execution and readback are async.
 */
export async function gpuTest(name: string, fn: (assert: GPUAssert) => void): Promise<void> {
  const rows: AssertionRow[] = [];
  const assert: GPUAssert = {
    expectClose: (actual, expected, tolerance = DEFAULT_TOLERANCE) => {
      rows.push({ actual, expected, tolerance, index: rows.length + 1 });
    },
    expect: (actual, expected, tolerance) => {
      assert.expectClose(actual, expected, tolerance);
    },
    expectValue: (actual, expected, tolerance = DEFAULT_TOLERANCE) => {
      const values = typeof expected === "number" ? [expected] : Array.from(expected as number[]);
      if (values.length > 4 || values.length === 0) {
        throw new Error(
          `[vitest-browser-three] expectValue supports 1-4 components, got ${values.length}`,
        );
      }
      // Build a constant node of the matching TSL type so both sides get the
      // identical toVec4() conversion.
      const node =
        values.length === 1
          ? float(values[0])
          : values.length === 2
            ? vec2(values[0], values[1])
            : values.length === 3
              ? vec3(values[0], values[1], values[2])
              : vec4(values[0], values[1], values[2], values[3]);
      rows.push({ actual, expected: node, tolerance, index: rows.length + 1 });
    },
  };

  fn(assert);

  if (rows.length === 0) {
    throw new Error(`gpuTest "${name}" contains no assertions.`);
  }

  // One row per assertion plus one reserved canary row.
  const rowCount = rows.length + 1;
  const canaryRow = rowCount - 1;
  const actualAttr = new StorageInstancedBufferAttribute(new Float32Array(rowCount * 4), 4);
  const expectedAttr = new StorageInstancedBufferAttribute(new Float32Array(rowCount * 4), 4);
  const actualStorage = storage(actualAttr, "vec4", rowCount);
  const expectedStorage = storage(expectedAttr, "vec4", rowCount);

  const renderer = await getRenderer();

  // Single batched dispatch. Every value is pre-evaluated via .toVar() before
  // any If branch: a node referenced inside multiple conditional branches can
  // otherwise be cached/declared in whichever branch builds it first, leaving
  // sibling branches reading an uninitialized variable (same pattern as
  // three.js PR #34331's gpu-test-utils).
  const computeNode = Fn(() => {
    const prepared = rows.map((row) => ({
      actual: toVar(row.actual),
      expected: toVar(row.expected),
    }));

    If(instanceIndex.equal(canaryRow), () => {
      actualStorage.element(instanceIndex).assign(vec4(CANARY_VALUE, 0, 0, 0));
    });

    for (let i = 0; i < rows.length; i++) {
      If(instanceIndex.equal(i), () => {
        actualStorage.element(instanceIndex).assign(toVec4(prepared[i].actual));
        expectedStorage.element(instanceIndex).assign(toVec4(prepared[i].expected));
      });
    }
  })().compute(rowCount);

  await renderer.computeAsync(computeNode);

  // WebGL2 storage buffers are effectively single-read: read each buffer once
  // and share the arrays between the canary check and the comparisons.
  const actualData = await readStorage(renderer, actualAttr);
  const expectedData = await readStorage(renderer, expectedAttr);

  const canaryActual = actualData[canaryRow * 4];
  if (Math.abs(canaryActual - CANARY_VALUE) > 1e-3) {
    throw new Error(
      `gpuTest "${name}": the compute kernel never ran (canary value missing — got ${formatFloat(canaryActual)}, expected ${formatFloat(CANARY_VALUE)}). ` +
        `This usually means the shader failed to build (invalid WGSL, e.g. a NaN or otherwise malformed literal reaching generated shader source) ` +
        `and the failure was only reported asynchronously — check the browser console for the underlying GPU compile error. ` +
        `Without the canary, every assertion would have silently compared a never-written 0 against a never-written 0 and passed.`,
    );
  }

  const failures: string[] = [];
  for (const row of rows) {
    const offset = (row.index - 1) * 4;
    for (let c = 0; c < 4; c++) {
      const a = actualData[offset + c];
      const e = expectedData[offset + c];
      // Relative tolerance, scaled by the magnitude of the expected value.
      if (Math.abs(a - e) > row.tolerance * Math.max(1, Math.abs(e))) {
        failures.push(
          `assertion #${row.index}, component ${c}: ${formatFloat(a)} !== ${formatFloat(e)} (tolerance ${row.tolerance})`,
        );
        break;
      }
    }
  }

  if (failures.length > 0) {
    const dump = rows
      .map((row) => {
        const offset = (row.index - 1) * 4;
        return [
          `assertion #${row.index}`,
          formatRow("actual  ", actualData.subarray(offset, offset + 4)),
          formatRow("expected", expectedData.subarray(offset, offset + 4)),
        ].join("\n");
      })
      .join("\n");
    throw new Error(
      `gpuTest "${name}" failed:\n${failures.map((f) => `  - ${f}`).join("\n")}\n\n${dump}`,
    );
  }
}
