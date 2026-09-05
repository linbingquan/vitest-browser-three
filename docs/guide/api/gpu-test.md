# gpuTest

Run assertions against three.js TSL expressions using a batched GPU compute dispatch.

## Signature

```ts
gpuTest(name: string, fn: (ctx: GpuTestContext) => void, options?: GpuTestOptions): Promise<void>
```

## Parameters

| Parameter               | Type            | Description                          |
| ----------------------- | --------------- | ------------------------------------ |
| `name`                  | `string`        | Test name                            |
| `fn`                    | `(ctx) => void` | Callback receiving assertion context |
| `options.backends`      | `BackendName[]` | Backend(s) to test against           |
| `options.maxAssertions` | `number`        | Max assertions per test (default: 4) |

## Assertion Context

```ts
interface GpuTestContext {
  eq: Assertion;
  closeAbs: Assertion;
  closeRel: Assertion;
  greaterThan: Assertion;
  greaterThanOrEqual: Assertion;
  lessThan: Assertion;
  lessThanOrEqual: Assertion;
}
```

## Assertions

| Method                     | Comparison                                    |
| -------------------------- | --------------------------------------------- |
| `eq(a, b)`                 | Exact component equality (`NaN !== NaN`)      |
| `closeAbs(a, b, tol)`      | `\|a - b\| <= tol`                            |
| `closeRel(a, b, tol)`      | `\|a - b\| <= tol * max(\|a\|, \|b\|, 1e-12)` |
| `greaterThan(a, b)`        | Component-wise `a > b`                        |
| `greaterThanOrEqual(a, b)` | Component-wise `a >= b`                       |
| `lessThan(a, b)`           | Component-wise `a < b`                        |
| `lessThanOrEqual(a, b)`    | Component-wise `a <= b`                       |

## Supported Types

- Scalars: `float`, `int`, `uint`
- Vectors: `vec2`, `vec3`, `vec4`
- Matrices: `mat3`, `mat4`

## Examples

### Basic Usage

```ts
import { gpuTest } from "vitest-browser-three";
import { float, sin, vec3 } from "three/tsl";

await gpuTest("scalar math", ({ eq, closeRel }) => {
  eq(float(2).add(3), float(5));
  closeRel(sin(float(Math.PI / 2)), float(1), 1e-3);
});
```

### Vector Operations

```ts
await gpuTest("vector math", ({ closeRel }) => {
  closeRel(vec3(1, 2, 3).mul(2), vec3(2, 4, 6));
  closeRel(vec3(1, 2, 3).add(vec3(0.5)), vec3(1.5, 2.5, 3.5));
});
```

### Matrix Assertions

```ts
import { Matrix4 } from "three/webgpu";
import { mat4, vec4 } from "three/tsl";

await gpuTest(
  "mat4 rotation",
  ({ closeRel }) => {
    const rot = mat4(new Matrix4().makeRotationZ(Math.PI / 2));
    closeRel(rot.mul(vec4(1, 0, 0, 1)), vec4(0, 1, 0, 1), 1e-6);
  },
  { maxAssertions: 8 }, // mat4 needs 4-row stride
);
```

### CPU Constants

CPU-side constants are accepted directly:

```ts
await gpuTest("cpu constants", ({ closeRel }) => {
  closeRel(float(0.1).add(0.2), 0.3, 1e-6); // number
  closeRel(vec3(1, 2, 3).mul(2), [2, 4, 6], 1e-6); // array
});
```

### Custom Messages

```ts
await gpuTest("with message", ({ closeRel }) => {
  closeRel(float(1), float(2), 1e-6, "custom context");
});
// Error: "custom context - expected 2, got 1"
```

## Error Handling

### Type Mismatch

```ts
// Throws: type mismatch between "float" and "vec3"
gpuTest("type error", ({ eq }) => {
  eq(float(1), vec3(1, 2, 3));
});
```

### No Assertions

```ts
// Throws: no assertions in test body
gpuTest("empty", () => {});
```

### Tolerance Failure

```ts
// Throws: outside tolerance
gpuTest("mismatch", ({ closeRel }) => {
  closeRel(float(1.001), float(1), 1e-6);
});
```
