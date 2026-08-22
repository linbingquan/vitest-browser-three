import type { Node } from "three/webgpu";
import { StorageInstancedBufferAttribute } from "three/webgpu";
import { Fn, instanceIndex, storage, float } from "three/tsl";
import { getRenderer, isBackendAvailable, type BackendName } from "./context.ts";
import { getDefaultBackends } from "./config.ts";
import { readStorage } from "./readback.ts";
import { DEFAULT_TOLERANCE, toVec4 } from "./assert.ts";

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
  /** Relative tolerance; scaled by max(1, |expected|). */
  tolerance?: number;
  /**
   * Backends to run this suite against. Defaults to configureGPU's setting,
   * or ['webgpu', 'webgl']. Unavailable backends are soft-skipped.
   */
  backends?: BackendName[];
}

function formatFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
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

/**
 * Fuzz a TSL expression across many instances in a single compute pass.
 *
 * Inputs are generated deterministically on the CPU (pure function of the
 * instance index), uploaded through a storage buffer, and fed to `spec.test`
 * as a float node. Reference values are computed on the CPU and compared
 * component-wise after GPU readback — mirroring gpuTest's toVec4()
 * conversion semantics.
 */
async function runFuzzBackend(name: string, spec: FuzzSpec, backend: BackendName): Promise<void> {
  const { instances, input, test, expected } = spec;
  const tolerance = spec.tolerance ?? DEFAULT_TOLERANCE;

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

  const inputAttr = new StorageInstancedBufferAttribute(
    Float32Array.from({ length: instances * 4 }, (_, k) => inputValues[k >> 2]),
    4,
  );
  const inputStorage = storage(inputAttr, "vec4", instances);
  const actualAttr = new StorageInstancedBufferAttribute(new Float32Array(instances * 4), 4);
  const actualStorage = storage(actualAttr, "vec4", instances);
  // NOTE: do not wrap expectedValues in a storage() node — creating a storage
  // node that is never used inside a kernel breaks backend buffer registration
  // for the attributes that ARE used (observed on three r0.185). Expected
  // values are CPU-side anyway, so they never need to enter the GPU.

  const renderer = await getRenderer(backend);

  // Bare instanceIndex addressing: the only pattern transform-feedback
  // backends (WebGL2 fallback) support reliably.
  await renderer.computeAsync(
    Fn(() => {
      actualStorage
        .element(instanceIndex)
        .assign(toVec4(test(float(inputStorage.element(instanceIndex).x))));
    })().compute(instances),
  );

  const actualData = await readStorage(renderer, actualAttr);
  // Compare directly against the CPU-side reference array — no GPU roundtrip.
  const expectedData = expectedValues;

  const failures: string[] = [];
  for (let i = 0; i < instances; i++) {
    for (let c = 0; c < 4; c++) {
      const a = actualData[i * 4 + c];
      const e = expectedData[i * 4 + c];
      if (Math.abs(a - e) > tolerance * Math.max(1, Math.abs(e))) {
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
 * Fuzz a TSL expression across many instances in a single compute dispatch
 * per requested backend. Unavailable backends are soft-skipped with a
 * warning; if none are available the test fails. See {@link FuzzSpec}.
 */
export async function gpuFuzzTest(name: string, spec: FuzzSpec): Promise<void> {
  const requested = spec.backends ?? getDefaultBackends();
  const available: BackendName[] = [];
  for (const backend of requested) {
    if (await isBackendAvailable(backend)) {
      available.push(backend);
    } else {
      console.warn(
        `[vitest-browser-three] gpuFuzzTest "${name}": skipping unavailable "${backend}" backend.`,
      );
    }
  }
  if (available.length === 0) {
    throw new Error(
      `[vitest-browser-three] gpuFuzzTest "${name}": no requested GPU backends are available (requested: ${requested.join(", ")}).`,
    );
  }

  for (const backend of available) {
    try {
      await runFuzzBackend(name, spec, backend);
    } catch (error) {
      const suffix = `[backend: ${backend}]`;
      if (error instanceof Error && !error.message.includes(suffix)) {
        error.message = `${error.message}\n(failed on ${suffix})`;
      }
      throw error;
    }
  }
}
