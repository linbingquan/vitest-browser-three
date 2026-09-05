# Basic Examples

## Scalar Math

```ts
import { gpuTest } from "vitest-browser-three";
import { float, sin, cos } from "three/tsl";

await gpuTest("scalar math", ({ eq, closeRel }) => {
  eq(float(2).add(3), float(5));
  eq(float(6).div(2), float(3));
  closeRel(sin(float(Math.PI / 2)), float(1), 1e-5);
  closeRel(cos(float(0)), float(1), 1e-5);
});
```

## Vector Operations

```ts
import { gpuTest } from "vitest-browser-three";
import { float, vec2, vec3, vec4 } from "three/tsl";

await gpuTest("vector ops", ({ closeRel }) => {
  closeRel(vec3(1, 2, 3).mul(2), vec3(2, 4, 6));
  closeRel(vec3(1, 2, 3).add(vec3(1)), vec3(2, 3, 4));
  closeRel(vec2(3, 4).length(), float(5), 1e-5);
  closeRel(vec4(1, 2, 3, 4).swizzle("xyzw"), vec4(1, 2, 3, 4));
});
```

## Matrix Transformations

```ts
import { Matrix4 } from "three/webgpu";
import { gpuTest } from "vitest-browser-three";
import { mat4, vec4 } from "three/tsl";

await gpuTest(
  "mat4 rotation",
  ({ closeRel }) => {
    const rot = mat4(new Matrix4().makeRotationZ(Math.PI / 2));
    // Rotation by 90 degrees
    closeRel(rot.mul(vec4(1, 0, 0, 1)), vec4(0, 1, 0, 1), 1e-5);
    closeRel(rot.mul(vec4(0, 1, 0, 1)), vec4(-1, 0, 0, 1), 1e-5);
  },
  { maxAssertions: 8 },
);
```

## Relational Assertions

```ts
import { gpuTest } from "vitest-browser-three";
import { float, vec3 } from "three/tsl";

await gpuTest("relational", ({ greaterThan, lessThan }) => {
  greaterThan(float(5), float(3));
  greaterThanOrEqual(float(3), float(3));
  lessThan(float(3), float(5));
  lessThanOrEqual(vec3(1, 2, 3), vec3(2, 3, 4));
});
```

## CPU Constants

```ts
import { gpuTest } from "vitest-browser-three";
import { float, vec3 } from "three/tsl";

await gpuTest("cpu constants", ({ closeRel }) => {
  closeRel(float(2).add(3), 5); // scalar
  closeRel(vec3(1, 2, 3).mul(2), [2, 4, 6]); // array
});
```

## Error Handling

```ts
import { gpuTest } from "vitest-browser-three";
import { float } from "three/tsl";

// Type mismatch throws
await expect(
  gpuTest("mismatch", ({ eq }) => {
    eq(float(1), vec3(1, 2, 3));
  }),
).rejects.toThrow(/type mismatch/);

// Tolerance failure throws
await expect(
  gpuTest("tolerance", ({ closeRel }) => {
    closeRel(float(1.001), float(1), 1e-6);
  }),
).rejects.toThrow(/tolerance/);
```
