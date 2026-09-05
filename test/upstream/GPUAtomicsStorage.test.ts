// Translated from three.js test/unit/addons/tsl/GPUAtomicsStorage.tests.js
// (MIT license, snapshot commit 1e4dcdc0 — see ./README.md).
//
// Coverage for every `atomicFunc()`-family op (AtomicFunctionNode.js) on a
// *storage* buffer (`instancedArray(...).toAtomic()`) -- as opposed to
// workgroup-scoped atomics. A storage buffer is visible to *every* invocation
// across *every* workgroup in the dispatch, so these tests deliberately
// spread invocations across several workgroups (workgroupSize far smaller
// than dispatchCount) to exercise cross-workgroup atomicity.
//
// Each op that needs a specific starting value is seeded with its own small
// "init" compute dispatch first, awaited before the "op" dispatch runs,
// so the two never race each other.
import { describe, expect, it } from "vitest";
import {
  Fn,
  instanceIndex,
  instancedArray,
  atomicAdd,
  atomicSub,
  atomicMax,
  atomicMin,
  atomicAnd,
  atomicOr,
  atomicXor,
  atomicLoad,
  atomicStore,
  uint,
  shiftLeft,
  bitNot,
} from "three/tsl";
import { rawComputeTest, readUintBuffer } from "../../src/index.ts";

const WORKGROUP_SIZE = 8;

function makeCounter() {
  return instancedArray(1, "uint").toAtomic();
}

async function seed(renderer: any, counter: any, value: number) {
  const kernel = Fn(() => {
    atomicStore(counter.element(uint(0)), uint(value));
  })().compute(1);

  await renderer.computeAsync(kernel);
}

describe("upstream: storage buffer atomics", () => {
  it("atomicAdd: concurrent adds across multiple workgroups sum exactly once each", async () => {
    await rawComputeTest("atomicAdd storage", { backend: "webgpu" }, async ({ renderer }) => {
      const dispatchCount = 64; // 8 workgroups of WORKGROUP_SIZE
      const counter = makeCounter();

      const kernel = Fn(() => {
        atomicAdd(counter.element(uint(0)), uint(1));
      })().compute(dispatchCount, [WORKGROUP_SIZE]);

      await renderer.computeAsync(kernel);

      const data = await readUintBuffer(renderer, counter.value);
      expect(data[0]).toBe(dispatchCount);
    });
  });

  it("atomicSub: concurrent subs across multiple workgroups drain exactly once each", async () => {
    await rawComputeTest("atomicSub storage", { backend: "webgpu" }, async ({ renderer }) => {
      const dispatchCount = 64;
      const counter = makeCounter();

      await seed(renderer, counter, dispatchCount);

      const kernel = Fn(() => {
        atomicSub(counter.element(uint(0)), uint(1));
      })().compute(dispatchCount, [WORKGROUP_SIZE]);

      await renderer.computeAsync(kernel);

      const data = await readUintBuffer(renderer, counter.value);
      expect(data[0]).toBe(0);
    });
  });

  it("atomicMax: concurrent max across multiple workgroups converges to the true maximum", async () => {
    await rawComputeTest("atomicMax storage", { backend: "webgpu" }, async ({ renderer }) => {
      const dispatchCount = 37; // deliberately not a multiple of WORKGROUP_SIZE
      const counter = makeCounter();

      await seed(renderer, counter, 0);

      const kernel = Fn(() => {
        atomicMax(counter.element(uint(0)), instanceIndex);
      })().compute(dispatchCount, [WORKGROUP_SIZE]);

      await renderer.computeAsync(kernel);

      const data = await readUintBuffer(renderer, counter.value);
      expect(data[0]).toBe(dispatchCount - 1);
    });
  });

  it("atomicMin: concurrent min across multiple workgroups converges to the true minimum", async () => {
    await rawComputeTest("atomicMin storage", { backend: "webgpu" }, async ({ renderer }) => {
      const dispatchCount = 37;
      const counter = makeCounter();

      await seed(renderer, counter, 0xffffffff);

      const kernel = Fn(() => {
        atomicMin(counter.element(uint(0)), instanceIndex);
      })().compute(dispatchCount, [WORKGROUP_SIZE]);

      await renderer.computeAsync(kernel);

      const data = await readUintBuffer(renderer, counter.value);
      expect(data[0]).toBe(0);
    });
  });

  it("atomicAnd: each invocation clears one distinct bit, all clears land", async () => {
    await rawComputeTest("atomicAnd storage", { backend: "webgpu" }, async ({ renderer }) => {
      // 32 invocations, each clearing a different one of the 32 bits --
      // only passes if every single invocation's AND actually took effect.
      const dispatchCount = 32;
      const counter = makeCounter();

      await seed(renderer, counter, 0xffffffff);

      const kernel = Fn(() => {
        const bit = shiftLeft(uint(1), instanceIndex);
        atomicAnd(counter.element(uint(0)), bitNot(bit));
      })().compute(dispatchCount, [WORKGROUP_SIZE]);

      await renderer.computeAsync(kernel);

      const data = await readUintBuffer(renderer, counter.value);
      expect(data[0]).toBe(0);
    });
  });

  it("atomicOr: each invocation sets one distinct bit, all sets land", async () => {
    await rawComputeTest("atomicOr storage", { backend: "webgpu" }, async ({ renderer }) => {
      const dispatchCount = 32;
      const counter = makeCounter();

      await seed(renderer, counter, 0);

      const kernel = Fn(() => {
        const bit = shiftLeft(uint(1), instanceIndex);
        atomicOr(counter.element(uint(0)), bit);
      })().compute(dispatchCount, [WORKGROUP_SIZE]);

      await renderer.computeAsync(kernel);

      const data = await readUintBuffer(renderer, counter.value);
      expect(data[0] >>> 0).toBe(0xffffffff);
    });
  });

  it("atomicXor: each invocation flips one distinct bit, all flips land", async () => {
    await rawComputeTest("atomicXor storage", { backend: "webgpu" }, async ({ renderer }) => {
      const dispatchCount = 32;
      const counter = makeCounter();

      await seed(renderer, counter, 0);

      const kernel = Fn(() => {
        const bit = shiftLeft(uint(1), instanceIndex);
        atomicXor(counter.element(uint(0)), bit);
      })().compute(dispatchCount, [WORKGROUP_SIZE]);

      await renderer.computeAsync(kernel);

      const data = await readUintBuffer(renderer, counter.value);
      expect(data[0] >>> 0).toBe(0xffffffff);
    });
  });

  it("atomicStore + atomicLoad: a store from one dispatch is visible to a later dispatch's loads", async () => {
    await rawComputeTest(
      "atomicStore+Load storage",
      { backend: "webgpu" },
      async ({ renderer }) => {
        const dispatchCount = 16;
        const counter = makeCounter();
        const output = instancedArray(dispatchCount, "uint");

        await seed(renderer, counter, 424242);

        const kernel = Fn(() => {
          output.element(instanceIndex).assign(atomicLoad(counter.element(uint(0))));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, output.value);

        for (let i = 0; i < dispatchCount; i++) {
          expect(data[i]).toBe(424242);
        }
      },
    );
  });
});
