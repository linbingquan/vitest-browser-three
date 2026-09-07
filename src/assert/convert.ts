/**
 * @internal
 * Type conversion utilities for TSL nodes.
 */

import type { Node, TypedArray } from "three/webgpu";
import { float, vec2, vec3, vec4, mat3, mat4 } from "three/tsl";
import type { NodeWithSwizzles, NodeWithToVar, NodeWithToVec4 } from "../three-internals.ts";
import { SWIZZLE, type Tuple9, type Tuple16 } from "./constants.ts";

/**
 * Convert any scalar/vector TSL node to vec4 by calling its own toVec4()
 * method (used by gpuFuzzTest, which doesn't need builder-time type
 * resolution). Both sides of an assertion go through the exact same
 * conversion, so padding/broadcast components always match.
 */
export function toVec4(node: Node): Node {
  const n = node as unknown as NodeWithToVec4;
  if (typeof n.toVec4 !== "function") {
    throw new Error(
      `[vitest-browser-three] Unsupported node for GPU assertion: only scalar/vector nodes are supported (got ${node.constructor?.name ?? typeof node}).`,
    );
  }
  return n.toVec4();
}

export function isNode(value: unknown): value is Node {
  return (value as { isNode?: boolean }).isNode === true;
}

/**
 * Zero-pad a value node with `count` meaningful components out to a vec4 so
 * it can be written with a single .assign().
 *
 * Padding follows three.js semantics: vec2 → (x, y, 0, 1), vec3 → (x, y, z, 1),
 * scalar broadcasts all four components. This matches the behavior of node.toVec4()
 * and ensures consistent comparison between gpuTest and gpuFuzzTest paths.
 */
export function padToVec4(value: Node, count: number): Node {
  if (count === 4) return value;
  const sw = value as unknown as NodeWithSwizzles;
  const components: Node[] = [];
  for (let i = 0; i < 4; i++) {
    if (i < count) {
      if (count === 1) {
        components.push(value);
      } else {
        components.push(sw[SWIZZLE[i] as keyof NodeWithSwizzles]);
      }
    } else if (count === 2) {
      // vec2 padding: z=0, w=1 (matches three.js toVec4 semantics)
      components.push(i === 2 ? float(0) : float(1));
    } else if (count === 3) {
      // vec3 padding: w=1 (matches three.js toVec4 semantics)
      components.push(float(1));
    } else {
      components.push(float(0));
    }
  }
  return vec4(...(components as [Node<"float">, Node<"float">, Node<"float">, Node<"float">]));
}

/** Convert a CPU-side constant into a TSL constant node (scalar/vector/matrix). */
export function cpuToNode(value: number | number[] | TypedArray): Node {
  if (typeof value === "number") return float(value);
  const arr = Array.isArray(value) ? value : Array.from(value as ArrayLike<number>);
  switch (arr.length) {
    case 1:
      return float(...arr);
    case 2:
      return vec2(...arr);
    case 3:
      return vec3(...arr);
    case 4:
      return vec4(...arr);
    case 9:
      // arr is length-checked above; the tuple assertion preserves the
      // current (TSL/GLSL column-major) argument order exactly.
      return mat3(...(arr as Tuple9));
    case 16:
      return mat4(...(arr as Tuple16));
    default:
      throw new Error(
        `[vitest-browser-three] expected value must have 1-4 (vector) or 9/16 (matrix) components, got ${arr.length}`,
      );
  }
}

/** Force evaluation of a TSL expression into a variable (node.toVar()). */
export function toVar(node: Node): Node {
  const n = node as unknown as NodeWithToVar;
  if (typeof n.toVar !== "function") {
    throw new Error(
      `[vitest-browser-three] Unsupported node for GPU assertion: node has no toVar() method (got ${node.constructor?.name ?? typeof node}).`,
    );
  }
  return n.toVar();
}
