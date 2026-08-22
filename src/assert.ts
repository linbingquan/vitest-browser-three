import { Node, StorageInstancedBufferAttribute, type TypedArray } from "three/webgpu";
import {
  Fn,
  If,
  Stack,
  instanceIndex,
  storage,
  float,
  vec2,
  vec3,
  vec4,
  mat3,
  mat4,
} from "three/tsl";
import { getRenderer, isBackendAvailable, type BackendName } from "./context.ts";
import { getDefaultBackends } from "./config.ts";
import { readStorage } from "./readback.ts";

export interface GPUAssert {
  /** Assert `actual` strictly equals `expected`, component-wise. */
  eq: (actual: Node, expected: Node, message?: string) => void;
  /** Assert `actual` is within `tolerance` (absolute) of `expected`. */
  closeAbs: (actual: Node, expected: Node, tolerance?: number, message?: string) => void;
  /** Assert `actual` is within `tolerance` (relative) of `expected`. */
  closeRel: (actual: Node, expected: Node, tolerance?: number, message?: string) => void;
  /** Component-wise relational assertions. */
  greaterThan: (actual: Node, expected: Node, message?: string) => void;
  greaterThanOrEqual: (actual: Node, expected: Node, message?: string) => void;
  lessThan: (actual: Node, expected: Node, message?: string) => void;
  lessThanOrEqual: (actual: Node, expected: Node, message?: string) => void;
  /** Assert `actual` is within `tolerance` (legacy relative, floor 1: `|a-e| <= tol * max(1, |expected|)`) of a CPU-side constant value. */
  expectValue: (
    actual: Node,
    expected: number | number[] | TypedArray,
    tolerance?: number,
    message?: string,
  ) => void;
  /** Legacy alias with legacy relative tolerance: `|a-e| <= tol * max(1, |expected|)`. */
  expectClose: (actual: Node, expected: Node, tolerance?: number) => void;
  /** Legacy alias with legacy relative tolerance: `|a-e| <= tol * max(1, |expected|)`. */
  expect: (actual: Node, expected: Node, tolerance?: number) => void;
}

type AssertionKind =
  | "eq"
  | "closeAbs"
  | "closeRel"
  | "legacyCloseRel"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual";

export const DEFAULT_TOLERANCE = 1e-6;

// Written unconditionally into a reserved row of the actual buffer. If the
// kernel fails to build (e.g. a NaN literal reaching generated WGSL),
// computeAsync may not reject at all — it just reports asynchronously — and
// every buffer reads back zero-initialized, so all assertions would silently
// compare 0 against 0 and pass. The canary's absence proves the dispatch
// never ran and lets us fail loudly instead.
const CANARY_VALUE = 12345.6789;

const MAX_COLUMNS = 4;

// Matrix types are stored column-major: mat3 = 3 columns of vec3, mat4 = 4
// columns of vec4 (see three's NodeBuilder.getElementType).
const MATRIX_LAYOUT: Record<string, { columns: number; columnLength: number }> = {
  mat3: { columns: 3, columnLength: 3 },
  mat4: { columns: 4, columnLength: 4 },
};

const SWIZZLE = ["x", "y", "z", "w"] as const;

/**
 * Convert any scalar/vector TSL node to vec4 by calling its own toVec4()
 * method (used by gpuFuzzTest, which doesn't need builder-time type
 * resolution). Both sides of an assertion go through the exact same
 * conversion, so padding/broadcast components always match.
 */
export function toVec4(node: Node): Node {
  const n = node as unknown as { toVec4?: () => Node };
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

/**
 * Zero-pad a value node with `count` meaningful components out to a vec4 so
 * it can be written with a single .assign(). Scalars broadcast via float().
 */
function padToVec4(value: Node, count: number): Node {
  if (count === 4) return value;
  const components: Node[] = [];
  for (let i = 0; i < 4; i++) {
    components.push(
      i < count ? (count === 1 ? float(value as never) : (value as any)[SWIZZLE[i]]) : float(0),
    );
  }
  return vec4(...(components as [Node<"float">, Node<"float">, Node<"float">, Node<"float">]));
}

/** Convert a CPU-side constant into a TSL constant node (scalar/vector/matrix). */
export function cpuToNode(value: number | number[] | TypedArray): Node {
  if (typeof value === "number") return float(value);
  const arr = Array.isArray(value) ? value : Array.from(value as ArrayLike<number>);
  switch (arr.length) {
    case 1:
      return float(arr[0]);
    case 2:
      return vec2(arr[0], arr[1]);
    case 3:
      return vec3(arr[0], arr[1], arr[2]);
    case 4:
      return vec4(arr[0], arr[1], arr[2], arr[3]);
    case 9:
      const [n0, n1, n2, n3, n4, n5, n6, n7, n8] = arr;
      return mat3(n0, n1, n2, n3, n4, n5, n6, n7, n8);
    case 16:
      const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15] = arr;
      return mat4(m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15);
    default:
      throw new Error(
        `[vitest-browser-three] expected value must have 1-4 (vector) or 9/16 (matrix) components, got ${arr.length}`,
      );
  }
}

interface ComparisonResult {
  index: number;
  actual: number;
  expected: number;
  ok: boolean;
}

function compareComponents(
  actual: number[],
  expected: number[],
  kind: AssertionKind,
  tolerance: number,
): ComparisonResult[] {
  return actual.map((a, i) => {
    const e = expected[i];
    let ok: boolean;
    switch (kind) {
      case "eq":
        ok = a === e;
        break;
      case "closeAbs":
        ok = Math.abs(a - e) <= tolerance;
        break;
      case "closeRel":
        ok = Math.abs(a - e) <= tolerance * Math.max(Math.abs(a), Math.abs(e), 1e-12);
        break;
      case "legacyCloseRel":
        // Stage-1 formula kept for backwards compatibility: the tolerance is
        // scaled by max(1, |expected|), so it behaves like an absolute
        // tolerance for small values.
        ok = Math.abs(a - e) <= tolerance * Math.max(1, Math.abs(e));
        break;
      case "greaterThan":
        ok = a > e;
        break;
      case "greaterThanOrEqual":
        ok = a >= e;
        break;
      case "lessThan":
        ok = a < e;
        break;
      case "lessThanOrEqual":
        ok = a <= e;
        break;
    }
    return { index: i, actual: a, expected: e, ok };
  });
}

const RELATIONAL_OPS: Partial<Record<AssertionKind, string>> = {
  greaterThan: ">",
  greaterThanOrEqual: ">=",
  lessThan: "<",
  lessThanOrEqual: "<=",
};

function describeFailure(
  kind: AssertionKind,
  tolerance: number,
  d: ComparisonResult,
  label: string,
): string {
  const op = RELATIONAL_OPS[kind];
  const core = op
    ? `expected ${op} ${formatFloat(d.expected)}, got ${formatFloat(d.actual)}`
    : `expected ${formatFloat(d.expected)}, got ${formatFloat(d.actual)} (tolerance ${tolerance})`;
  return `${label}, component ${d.index}: ${core}`;
}

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

/**
 * A statement node that resolves the real types of its two values at shader
 * build time (setup(builder) is the only place where a real NodeBuilder
 * exists), then writes each column (1 for scalar/vector, 3-4 for matrices)
 * zero-padded to vec4 through the caller-supplied writeColumn callback.
 *
 * resolved* fields persist after the build so the CPU-side harness knows how
 * many rows/components to read back per assertion.
 */
class AssertionNode extends Node {
  writeColumn: (c: number, actualVec4: Node, expectedVec4: Node) => void;
  value1: Node;
  value2: Node;
  kind: AssertionKind;
  tolerance: number;
  baseRow: number;
  message?: string;

  resolvedType: string | null = null;
  resolvedColumns = 0;
  resolvedColumnLength = 0;

  constructor(
    writeColumn: (c: number, actualVec4: Node, expectedVec4: Node) => void,
    value1: Node,
    value2: Node,
    kind: AssertionKind,
    tolerance: number,
    baseRow: number,
  ) {
    super("void");
    this.writeColumn = writeColumn;
    this.value1 = value1;
    this.value2 = value2;
    this.kind = kind;
    this.tolerance = tolerance;
    this.baseRow = baseRow;
  }

  setup(builder: any): undefined {
    const type1: string = this.value1.getNodeType(builder);
    const type2: string = this.value2.getNodeType(builder);

    if (type1 !== type2) {
      throw new Error(
        `[vitest-browser-three] type mismatch — comparing "${type1}" against "${type2}".`,
      );
    }

    const matrixLayout = MATRIX_LAYOUT[type1];
    let columns: number;
    let columnLength: number;
    let isMatrix: boolean;

    if (matrixLayout !== undefined) {
      ({ columns, columnLength } = matrixLayout);
      isMatrix = true;
    } else {
      columnLength = builder.getTypeLength(type1);
      columns = 1;
      isMatrix = false;
      if (!(columnLength >= 1 && columnLength <= 4)) {
        throw new Error(
          `[vitest-browser-three] unsupported assertion type "${type1}" (${columnLength} components) — only scalars, vecN, mat3 and mat4 are supported.`,
        );
      }
    }

    this.resolvedType = type1;
    this.resolvedColumns = columns;
    this.resolvedColumnLength = columnLength;

    // Force evaluation ONCE before any If branch: a node referenced inside
    // multiple conditional branches can be cached in whichever branch builds
    // it first, leaving sibling branches reading uninitialized values.
    const v1 = toVar(this.value1);
    const v2 = toVar(this.value2);

    for (let c = 0; c < columns; c++) {
      const col1 = isMatrix ? (v1 as unknown as { element: (i: number) => Node }).element(c) : v1;
      const col2 = isMatrix ? (v2 as unknown as { element: (i: number) => Node }).element(c) : v2;
      this.writeColumn(c, padToVec4(col1, columnLength), padToVec4(col2, columnLength));
    }

    return undefined;
  }
}

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

/**
 * Run TSL assertions on the GPU via a single batched compute dispatch.
 *
 * Each assertion occupies a fixed MAX_COLUMNS-row stride; one extra row is
 * reserved for a canary that detects kernels which never ran (shader build
 * failures are reported by WebGPURenderer only asynchronously, so without
 * the canary all buffers read back zero and every assertion silently passes
 * as 0-vs-0). All rows are written via bare `instanceIndex` addressing
 * guarded by `If(instanceIndex.equal(row), ...)` — the only write pattern
 * the WebGL2 transform-feedback fallback supports. Results are read back
 * once and compared on the CPU.
 *
 * Supports scalars, vecN and mat3/mat4. Type resolution happens at shader
 * build time from the real node types; comparing mismatched types throws.
 *
 * Note: `fn` is executed inside the kernel's graph-build callback (it may be
 * invoked more than once during multi-stage builds; it must be idempotent).
 */
async function runBackend(
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
      Stack(nodes[nodes.length - 1] as never);
    };

  const assertAPI: GPUAssert = {
    eq: (a, e, msg) => makeAssertion("eq", 0, msg)(a, e),
    closeAbs: (a, e, tol = DEFAULT_TOLERANCE, msg) => makeAssertion("closeAbs", tol, msg)(a, e),
    closeRel: (a, e, tol = DEFAULT_TOLERANCE, msg) => makeAssertion("closeRel", tol, msg)(a, e),
    greaterThan: (a, e, msg) => makeAssertion("greaterThan", 0, msg)(a, e),
    greaterThanOrEqual: (a, e, msg) => makeAssertion("greaterThanOrEqual", 0, msg)(a, e),
    lessThan: (a, e, msg) => makeAssertion("lessThan", 0, msg)(a, e),
    lessThanOrEqual: (a, e, msg) => makeAssertion("lessThanOrEqual", 0, msg)(a, e),
    // Legacy stage-1 aliases, kept for backwards compatibility.
    expectClose: (a, e, tol = DEFAULT_TOLERANCE) => makeAssertion("legacyCloseRel", tol)(a, e),
    expect: (a, e, tol = DEFAULT_TOLERANCE) => makeAssertion("legacyCloseRel", tol)(a, e),
    expectValue: (actual, expected, tolerance = DEFAULT_TOLERANCE, msg) =>
      makeAssertion("legacyCloseRel", tolerance, msg)(actual, cpuToNode(expected)),
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
 * Run TSL assertions on the GPU via a single batched compute dispatch.
 *
 * Each assertion occupies a fixed MAX_COLUMNS-row stride; one extra row is
 * reserved for a canary that detects kernels which never ran (shader build
 * failures are reported by WebGPURenderer only asynchronously, so without
 * the canary all buffers read back zero and every assertion silently passes
 * as 0-vs-0). All rows are written via bare `instanceIndex` addressing
 * guarded by `If(instanceIndex.equal(row), ...)` — the only write pattern
 * the WebGL2 transform-feedback fallback supports. Results are read back
 * once and compared on the CPU.
 *
 * Supports scalars, vecN and mat3/mat4. Type resolution happens at shader
 * build time from the real node types; comparing mismatched types throws.
 *
 * The suite runs once per requested backend (see GPURunOptions.backends);
 * unavailable backends are soft-skipped with a warning.
 *
 * Note: `fn` is executed inside the kernel's graph-build callback (it may be
 * invoked more than once during multi-stage builds; it must be idempotent).
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
  const available: BackendName[] = [];
  for (const backend of requested) {
    if (await isBackendAvailable(backend)) {
      available.push(backend);
    } else {
      console.warn(
        `[vitest-browser-three] gpuTest "${name}": skipping unavailable "${backend}" backend.`,
      );
    }
  }
  if (available.length === 0) {
    throw new Error(
      `[vitest-browser-three] gpuTest "${name}": no requested GPU backends are available (requested: ${requested.join(", ")}).`,
    );
  }

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
