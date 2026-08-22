import type { Node } from "three/webgpu";
import { StorageInstancedBufferAttribute, type TypedArray } from "three/webgpu";
import { Fn, storage, uint, float, vec2, vec3, vec4 } from "three/tsl";
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

/**
 * Convert any scalar/vector TSL node to vec4 so every assertion occupies one
 * storage row. Both sides of an assertion go through the exact same
 * conversion, so padding/broadcast components always match — as long as
 * actual and expected have the same type.
 */
function toVec4(node: Node): Node {
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
 * Run TSL assertions on the GPU via compute shaders.
 *
 * Each `expect*()` call inside `fn` becomes one assertion row. The rows are
 * executed as compute passes on a shared renderer, results are read back to
 * the CPU and compared with relative tolerance.
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

  const count = rows.length;
  const actualAttr = new StorageInstancedBufferAttribute(new Float32Array(count * 4), 4);
  const expectedAttr = new StorageInstancedBufferAttribute(new Float32Array(count * 4), 4);
  const actualStorage = storage(actualAttr, "vec4", count);
  const expectedStorage = storage(expectedAttr, "vec4", count);

  const renderer = await getRenderer();

  // One compute pass per assertion: simple and correct. Batching into a
  // single pass is only worth it for fuzz-style loops over shared expressions.
  for (const row of rows) {
    const i = row.index - 1;
    const computeNode = Fn(() => {
      actualStorage.element(uint(i)).assign(toVec4(row.actual));
      expectedStorage.element(uint(i)).assign(toVec4(row.expected));
    })().compute(1);
    await renderer.computeAsync(computeNode);
  }

  const actualData = await readStorage(renderer, actualAttr);
  const expectedData = await readStorage(renderer, expectedAttr);

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
