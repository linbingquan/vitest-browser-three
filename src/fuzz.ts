import type { Node } from "three/webgpu";
import { StorageInstancedBufferAttribute } from "three/webgpu";
import { Fn, If, instanceIndex, storage, float, vec4 } from "three/tsl";
import { randomCanaryValue } from "./assert/constants.ts";
import { getRenderer, resolveAvailableBackends, type BackendName } from "./context.ts";
import { getDefaultBackends } from "./config.ts";
import { readStorage } from "./readback.ts";
import { DEFAULT_TOLERANCE, toVec4 } from "./assert.ts";
import { formatFloat } from "./assert/format.ts";
import { closeRelCompare, closeAbsCompare } from "./assert/compare.ts";

/**
 * Deterministic fuzz-test spec: every instance gets one scalar input derived
 * from its index, one GPU expression evaluated on that input, and one CPU-side
 * reference value. All instances run in a single compute pass.
 */
export interface FuzzSpec {
  /** Number of instances to test. */
  instances: number;
  /** Deterministic input generator (pure function of the instance index). */
  input: (instance: number) => number;
  /** Build the actual GPU expression from the input node. */
  test: (x: Node<"float">) => Node;
  /** CPU-side reference value(s) for each instance. */
  expected: (x: number, instance: number) => number | number[];
  /**
   * Tolerance for comparisons. When `absolute` is true, uses absolute tolerance
   * (`|a - e| <= tolerance`); otherwise uses relative tolerance
   * (`|a - e| <= tolerance * max(|a|, |e|, 1e-12)`).
   */
  tolerance?: number;
  /**
   * If true, use absolute tolerance (`|a - e| <= tolerance`) instead of the
   * default relative tolerance. Use this for periodic functions like sin/cos
   * where f32 and f64 precision differences can cause relative tolerance to
   * fail near zero crossings (e.g. sin(π) differs between f32 and f64).
   */
  absolute?: boolean;
  /**
   * Backends to run this suite against. Defaults to configureGPU's setting,
   * or ['webgpu', 'webgl']. Unavailable backends are soft-skipped.
   */
  backends?: BackendName[];
}

/** Pad a CPU-side reference value exactly like TSL's node.toVec4() would. */
function padExpected(value: number | number[]): [number, number, number, number] {
  if (typeof value === "number") return [value, value, value, value]; // scalar broadcasts
  if (value.length === 0 || value.length > 4) {
    throw new Error(
      `[vitest-browser-three] gpuFuzzTest expected must return 1-4 components, got ${value.length}`,
    );
  }
  if (value.length === 1) return [value[0], value[0], value[0], value[0]]; // broadcast like a scalar
  if (value.length === 2) return [value[0], value[1], 0, 1];
  if (value.length === 3) return [value[0], value[1], value[2], 1];
  return [value[0], value[1], value[2], value[3]];
}

/** Implementation of gpuFuzzTest for a single backend; see gpuFuzzTest for contract. */
async function runFuzzBackend(name: string, spec: FuzzSpec, backend: BackendName): Promise<void> {
  const { instances, input, test, expected, absolute } = spec;
  const tolerance = spec.tolerance ?? DEFAULT_TOLERANCE;
  const compare = absolute ? closeAbsCompare : closeRelCompare;

  if (!Number.isInteger(instances) || instances < 1) {
    throw new Error(
      `[vitest-browser-three] gpuFuzzTest "${name}": instances must be a positive integer.`,
    );
  }

  const inputValues = new Float32Array(instances);
  const expectedValues = new Float32Array(instances * 4);
  for (let i = 0; i < instances; i++) {
    const x = input(i);
    // Round-trip through f32 first: this is the value the GPU actually
    // receives via the storage buffer, so the CPU reference must be
    // computed from it too (matters near fract/step thresholds).
    const xF32 = Math.fround(x);
    inputValues[i] = xF32;
    const [a, b, c, d] = padExpected(expected(xF32, i));
    expectedValues.set([a, b, c, d], i * 4);
  }

  const canaryValue = randomCanaryValue();
  const totalRows = instances + 1;
  const canaryRow = instances;

  const inputAttr = new StorageInstancedBufferAttribute(
    Float32Array.from({ length: totalRows * 4 }, (_, k) =>
      k < instances * 4 ? inputValues[k >> 2] : 0,
    ),
    4,
  );
  const inputStorage = storage(inputAttr, "vec4", totalRows);
  const actualAttr = new StorageInstancedBufferAttribute(new Float32Array(totalRows * 4), 4);
  const actualStorage = storage(actualAttr, "vec4", totalRows);
  // NOTE: do not wrap expectedValues in a storage() node — creating a storage
  // node that is never used inside a kernel breaks backend buffer registration
  // for the attributes that ARE used (observed on three r0.185). Expected
  // values are CPU-side anyway, so they never need to enter the GPU.

  const renderer = await getRenderer(backend);

  // Bare instanceIndex addressing: the only pattern transform-feedback
  // backends (WebGL2 fallback) support reliably. Last row reserved
  // for canary (see randomCanaryValue() for stale-kernel vulnerability).
  await renderer.computeAsync(
    Fn(() => {
      If(instanceIndex.equal(canaryRow), () => {
        actualStorage.element(instanceIndex).assign(vec4(canaryValue, 0, 0, 0));
      });

      If(instanceIndex.lessThan(instances), () => {
        actualStorage
          .element(instanceIndex)
          .assign(toVec4(test(float(inputStorage.element(instanceIndex).x))));
      });
    })().compute(totalRows),
  );

  const actualData = await readStorage(renderer, actualAttr);

  // Canary check: if the kernel failed to build, the canary will be
  // missing (read back as 0), preventing silent false positives from
  // stale-kernel execution on WebGL2 fallback.
  const canaryActual = actualData[canaryRow * 4];
  if (canaryActual !== canaryValue) {
    throw new Error(
      `gpuFuzzTest "${name}": the compute kernel never ran (canary mismatch — got ${formatFloat(canaryActual)}, expected ${formatFloat(canaryValue)}). ` +
        `This usually means the shader failed to build (invalid WGSL) ` +
        `and the failure was only reported asynchronously — check the browser console.`,
    );
  }

  // Compare directly against the CPU-side reference array — no GPU roundtrip.
  const expectedData = expectedValues;

  const failures: string[] = [];
  for (let i = 0; i < instances; i++) {
    for (let c = 0; c < 4; c++) {
      const a = actualData[i * 4 + c];
      const e = expectedData[i * 4 + c];
      if (!compare(a, e, tolerance)) {
        failures.push(
          `instance ${i} (input ${formatFloat(inputValues[i])}), component ${c}: ` +
            `${formatFloat(a)} !== ${formatFloat(e)} (tolerance ${tolerance})`,
        );
        break;
      }
    }
  }

  if (failures.length > 0) {
    const shown = failures.slice(0, 10);
    const more =
      failures.length > shown.length ? `\n  ...and ${failures.length - shown.length} more` : "";
    throw new Error(
      `gpuFuzzTest "${name}" failed (${failures.length}/${instances} instances):\n` +
        shown.map((f) => `  - ${f}`).join("\n") +
        more,
    );
  }
}

/**
 * Run a deterministic fuzz test across many instances on each requested backend.
 *
 * Inputs are generated on the CPU with `spec.input(i)`, uploaded as floats,
 * and compared against `spec.expected` after GPU readback. Unavailable
 * backends are soft-skipped; if none are available, the test fails.
 *
 * @param name - Test name used in error messages.
 * @param spec - Fuzz specification. See {@link FuzzSpec}.
 * @returns Resolves after all instances pass on every available backend;
 *   rejects on first failure.
 *
 * @example
 * ```ts
 * await gpuFuzzTest('sin²x + cos²x ≈ 1', {
 *   instances: 1024,
 *   input: (i) => (i / 1024) * Math.PI * 2,
 *   test: (x) => sin(x).pow(2).add(cos(x).pow(2)),
 *   expected: () => 1,
 *   tolerance: 1e-6,
 * });
 * ```
 */
export async function gpuFuzzTest(name: string, spec: FuzzSpec): Promise<void> {
  const requested = spec.backends ?? getDefaultBackends();
  const available = await resolveAvailableBackends(requested, `gpuFuzzTest "${name}"`);

  for (const backend of available) {
    try {
      await runFuzzBackend(name, spec, backend);
    } catch (error) {
      const suffix = `[backend: ${backend}]`;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(suffix)) {
        const wrapped = new Error(`${message}\n(failed on ${suffix})`);
        wrapped.cause = error;
        throw wrapped;
      }
      throw error;
    }
  }
}
