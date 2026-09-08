# gpuTest

Run assertions against three.js TSL expressions using a batched GPU compute dispatch.

## Signature

```ts
gpuTest(name: string, fn: (ctx: GPUAssert) => void, options?: GPURunOptions): Promise<void>
```

## Parameters

| Parameter               | Type            | Description                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | `string`        | Test name                                                                                                                                                                                                                                                                       |
| `fn`                    | `(ctx) => void` | Callback receiving assertion context                                                                                                                                                                                                                                            |
| `options.backends`      | `BackendName[]` | Backend(s) to test against                                                                                                                                                                                                                                                      |
| `options.maxAssertions` | `number`        | Upper bound on assertion calls per test (default: 64). The library reserves one row (a vec4) for the canary value, so the maximum number of actual assertions is `maxAssertions - 1`. Each assertion uses 4 rows. Set `maxAssertions = N + 1` if you need exactly N assertions. |

## Assertion Context

```ts
interface GPUAssert {
  eq: (actual: Node, expected: Node, message?: string) => void;
  closeAbs: (actual: Node, expected: ExpectedValue, tolerance?: number, message?: string) => void;
  closeRel: (actual: Node, expected: ExpectedValue, tolerance?: number, message?: string) => void;
  greaterThan: (actual: Node, expected: Node, message?: string) => void;
  greaterThanOrEqual: (actual: Node, expected: Node, message?: string) => void;
  lessThan: (actual: Node, expected: Node, message?: string) => void;
  lessThanOrEqual: (actual: Node, expected: Node, message?: string) => void;
}
```

## Assertions

| Method                     | Comparison                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `eq(a, b)`                 | Exact component equality (`NaN !== NaN`)                                            |
| `closeAbs(a, b, tol)`      | `\|a - b\| <= tol` (tol defaults to `DEFAULT_TOLERANCE`)                            |
| `closeRel(a, b, tol)`      | `\|a - b\| <= tol * max(\|a\|, \|b\|, 1e-12)` (tol defaults to `DEFAULT_TOLERANCE`) |
| `greaterThan(a, b)`        | Component-wise `a > b`                                                              |
| `greaterThanOrEqual(a, b)` | Component-wise `a >= b`                                                             |
| `lessThan(a, b)`           | Component-wise `a < b`                                                              |
| `lessThanOrEqual(a, b)`    | Component-wise `a <= b`                                                             |

## Default Tolerance

`closeAbs` and `closeRel` default to `DEFAULT_TOLERANCE` when the `tolerance` argument is omitted.
The value is `1e-6` and the constant is exported from both the main entry and the pure entry.

```ts
import { DEFAULT_TOLERANCE } from "vitest-browser-three";
// or: import { DEFAULT_TOLERANCE } from "vitest-browser-three/pure";

console.log(DEFAULT_TOLERANCE); // 1e-6
```

## Supported Types

- Scalars: `float`, `int`, `uint`
- Vectors: `vec2`, `vec3`, `vec4`
- Matrices: `mat3`, `mat4`

## Examples

### Basic Usage

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float, sin } from "three/tsl";

it("scalar math", async () => {
  await gpuTest("scalar math", ({ eq, closeRel }) => {
    eq(float(2).add(3), float(5));
    closeRel(sin(float(Math.PI / 2)), 1, 1e-3);
  });
});
```

### Vector Operations

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float, vec2, vec3 } from "three/tsl";

it("vector math", async () => {
  await gpuTest("vector math", ({ closeRel }) => {
    closeRel(vec3(1, 2, 3).mul(2), vec3(2, 4, 6));
    closeRel(vec2(3, 4).length(), float(5), 1e-5); // vec2.length()
  });
});
```

### Matrix Assertions

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { Matrix4 } from "three/webgpu";
import { mat4, vec4 } from "three/tsl";

it("mat4 rotation", async () => {
  await gpuTest(
    "mat4 rotation",
    ({ closeRel }) => {
      const rot = mat4(new Matrix4().makeRotationZ(Math.PI / 2));
      closeRel(rot.mul(vec4(1, 0, 0, 1)), vec4(0, 1, 0, 1), 1e-6);
    },
    { maxAssertions: 8 }, // mat4 needs 4-row stride
  );
});
```

### Relational Assertions

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float } from "three/tsl";

it("relational", async () => {
  await gpuTest("relational", ({ greaterThan, lessThan }) => {
    greaterThan(float(5), float(3));
    lessThan(float(3), float(5));
  });
});
```

### CPU Constants

CPU-side constants are accepted directly:

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float, vec3 } from "three/tsl";

it("cpu constants", async () => {
  await gpuTest("cpu constants", ({ closeRel }) => {
    closeRel(float(0.1).add(0.2), 0.3, 1e-6); // number
    closeRel(vec3(1, 2, 3).mul(2), [2, 4, 6], 1e-6); // array
  });
});
```

### Custom Messages

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float } from "three/tsl";

it("with message", async () => {
  await gpuTest("with message", ({ closeRel }) => {
    closeRel(float(1), float(2), 1e-6, "custom context");
  });
});
// Error: custom context, component 0: expected 2.0, got 1.0 (tolerance 1e-6)
```

## Error Handling

### Type Mismatch

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float, vec3 } from "three/tsl";

it("type error", async () => {
  // Throws: type mismatch — comparing "float" against "vec3"
  await gpuTest("type error", ({ eq }) => {
    eq(float(1), vec3(1, 2, 3));
  });
});
```

### No Assertions

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";

it("empty", async () => {
  // Throws: no assertions in test body
  await gpuTest("empty", () => {});
});
```

### Tolerance Failure

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float } from "three/tsl";

it("mismatch", async () => {
  // Throws: outside tolerance
  await gpuTest("mismatch", ({ closeRel }) => {
    closeRel(float(1.001), float(1), 1e-6);
  });
});
```

## See Also

- [gpuFuzzTest](./gpu-fuzz-test.md) — Fuzz testing with deterministic inputs
- [rawComputeTest](./raw-compute.md) — Low-level GPU compute control
