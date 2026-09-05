// Reference: three.js test/unit/addons/tsl/GPUAtomicsStorage.tests.js (MIT)
// Ported as API validation example for rawComputeTest.

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
  int,
  shiftLeft,
  bitNot,
} from "three/tsl";
import { rawComputeTest, readUintBuffer, readIntBuffer } from "../../src/index.ts";

const WORKGROUP_SIZE = 8;

function makeUintCounter() {
  return instancedArray(1, "uint").toAtomic();
}

function makeIntCounter() {
  return instancedArray(1, "int").toAtomic();
}

async function seedUint(renderer: any, counter: any, value: number) {
  const kernel = Fn(() => {
    atomicStore(counter.element(uint(0)), uint(value));
  })().compute(1);
  await renderer.computeAsync(kernel);
}

async function seedInt(renderer: any, counter: any, value: number) {
  const kernel = Fn(() => {
    atomicStore(counter.element(int(0)), int(value));
  })().compute(1);
  await renderer.computeAsync(kernel);
}

describe("rawComputeTest API validation", () => {
  describe("readUintBuffer", () => {
    it("atomicAdd: concurrent adds sum exactly once each", async () => {
      await rawComputeTest("atomicAdd uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 64;
        const counter = makeUintCounter();

        const kernel = Fn(() => {
          atomicAdd(counter.element(uint(0)), uint(1));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, counter.value);
        expect(data[0]).toBe(dispatchCount);
      });
    });

    it("atomicSub: concurrent subs drain exactly once each", async () => {
      await rawComputeTest("atomicSub uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 64;
        const counter = makeUintCounter();

        await seedUint(renderer, counter, dispatchCount);

        const kernel = Fn(() => {
          atomicSub(counter.element(uint(0)), uint(1));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, counter.value);
        expect(data[0]).toBe(0);
      });
    });

    it("atomicMax: converges to the true maximum", async () => {
      await rawComputeTest("atomicMax uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 37;
        const counter = makeUintCounter();

        await seedUint(renderer, counter, 0);

        const kernel = Fn(() => {
          atomicMax(counter.element(uint(0)), instanceIndex);
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, counter.value);
        expect(data[0]).toBe(dispatchCount - 1);
      });
    });

    it("atomicMin: converges to the true minimum", async () => {
      await rawComputeTest("atomicMin uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 37;
        const counter = makeUintCounter();

        await seedUint(renderer, counter, 0xffffffff);

        const kernel = Fn(() => {
          atomicMin(counter.element(uint(0)), instanceIndex);
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, counter.value);
        expect(data[0]).toBe(0);
      });
    });

    it("atomicAnd: each invocation clears one distinct bit", async () => {
      await rawComputeTest("atomicAnd uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 32;
        const counter = makeUintCounter();

        await seedUint(renderer, counter, 0xffffffff);

        const kernel = Fn(() => {
          const bit = shiftLeft(uint(1), instanceIndex);
          atomicAnd(counter.element(uint(0)), bitNot(bit));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, counter.value);
        expect(data[0]).toBe(0);
      });
    });

    it("atomicOr: each invocation sets one distinct bit", async () => {
      await rawComputeTest("atomicOr uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 32;
        const counter = makeUintCounter();

        await seedUint(renderer, counter, 0);

        const kernel = Fn(() => {
          const bit = shiftLeft(uint(1), instanceIndex);
          atomicOr(counter.element(uint(0)), bit);
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, counter.value);
        expect(data[0] >>> 0).toBe(0xffffffff);
      });
    });

    it("atomicXor: each invocation flips one distinct bit", async () => {
      await rawComputeTest("atomicXor uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 32;
        const counter = makeUintCounter();

        await seedUint(renderer, counter, 0);

        const kernel = Fn(() => {
          const bit = shiftLeft(uint(1), instanceIndex);
          atomicXor(counter.element(uint(0)), bit);
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, counter.value);
        expect(data[0] >>> 0).toBe(0xffffffff);
      });
    });

    it("atomicStore + atomicLoad: a store from one dispatch is visible to later loads", async () => {
      await rawComputeTest("atomicStore+Load uint", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 16;
        const counter = makeUintCounter();
        const output = instancedArray(dispatchCount, "uint");

        await seedUint(renderer, counter, 424242);

        const kernel = Fn(() => {
          output.element(instanceIndex).assign(atomicLoad(counter.element(uint(0))));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readUintBuffer(renderer, output.value);

        for (let i = 0; i < dispatchCount; i++) {
          expect(data[i]).toBe(424242);
        }
      });
    });
  });

  describe("readIntBuffer", () => {
    it("atomicAdd: concurrent adds sum exactly once each (signed)", async () => {
      await rawComputeTest("atomicAdd int", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 64;
        const counter = makeIntCounter();

        const kernel = Fn(() => {
          atomicAdd(counter.element(int(0)), int(1));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readIntBuffer(renderer, counter.value);
        expect(data[0]).toBe(dispatchCount);
      });
    });

    it("atomicSub: concurrent subs drain exactly once each (signed)", async () => {
      await rawComputeTest("atomicSub int", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 64;
        const counter = makeIntCounter();

        await seedInt(renderer, counter, dispatchCount);

        const kernel = Fn(() => {
          atomicSub(counter.element(int(0)), int(1));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readIntBuffer(renderer, counter.value);
        expect(data[0]).toBe(0);
      });
    });

    it("handles negative values correctly", async () => {
      await rawComputeTest("atomicAdd negative", { backend: "webgpu" }, async ({ renderer }) => {
        const dispatchCount = 32;
        const counter = makeIntCounter();

        // Start with -32 and add 1 from each invocation
        await seedInt(renderer, counter, -32);

        const kernel = Fn(() => {
          atomicAdd(counter.element(int(0)), int(1));
        })().compute(dispatchCount, [WORKGROUP_SIZE]);

        await renderer.computeAsync(kernel);

        const data = await readIntBuffer(renderer, counter.value);
        expect(data[0]).toBe(0);
      });
    });
  });
});
