import type { Node, StorageInstancedBufferAttribute } from "three/webgpu";

// Minimal structural interfaces for three.js APIs that are untyped in
// @types/three. Centralized here so our assumptions about three's internals
// live in one place; replace or delete as upstream types improve.

/** Minimal structural type for a Node that can be converted to vec4. */
export interface NodeWithToVec4 {
  toVec4(): Node;
}

/** Minimal structural type for a Node that can be forced into a variable. */
export interface NodeWithToVar {
  toVar(): Node;
}

/** Minimal structural type for a Node that supports element access (matrices). */
export interface NodeWithElement {
  element(index: number): Node;
}

/** Minimal structural type for a Node exposing swizzle components. */
export interface NodeWithSwizzles {
  x: Node;
  y: Node;
  z: Node;
  w: Node;
}

/** Minimal backend interface required by storage-buffer readback. */
export interface BackendLike {
  getArrayBufferAsync(attribute: StorageInstancedBufferAttribute): Promise<ArrayBuffer>;
}

/** Minimal builder surface used by AssertionNode.setup. */
export interface NodeBuilderLike {
  getTypeLength(type: string): number;
}
