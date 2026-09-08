/**
 * @internal
 * AssertionNode class for building GPU assertions.
 */

import { Node } from "three/webgpu";
import type { NodeBuilderLike, NodeWithElement } from "../three-internals.ts";
import type { AssertionKind } from "./compare.ts";
import { MATRIX_LAYOUT } from "./constants.ts";
import { padToVec4, toVar } from "./convert.ts";

type SetupBuilder = NodeBuilderLike & Parameters<Node["getNodeType"]>[0];

/**
 * A statement node that resolves the real types of its two values at shader
 * build time (setup(builder) is the only place where a real NodeBuilder
 * exists), then writes each column (1 for scalar/vector, 3-4 for matrices)
 * zero-padded to vec4 through the caller-supplied writeColumn callback.
 *
 * resolved* fields persist after the build so the CPU-side harness knows how
 * many rows/components to read back per assertion.
 */
export class AssertionNode extends Node {
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

  setup(builder: SetupBuilder): undefined {
    // TSL's "color" type behaves as vec3 in shaders; normalize so color()
    // nodes can be compared against vec3 values/constants directly.
    const normalizeType = (t: string) => (t === "color" ? "vec3" : t);
    const type1: string = normalizeType(this.value1.getNodeType(builder));
    const type2: string = normalizeType(this.value2.getNodeType(builder));

    if (type1 !== type2) {
      throw new Error(
        `[vitest-browser-three] type mismatch — comparing "${type1}" against "${type2}".`,
      );
    }

    const matrixLayout = MATRIX_LAYOUT[type1];
    let columns: number;
    let columnLength: number;

    if (matrixLayout !== undefined) {
      ({ columns, columnLength } = matrixLayout);
    } else {
      // Defensively check that getTypeLength exists before calling
      if (typeof builder.getTypeLength !== "function") {
        throw new Error(
          `[vitest-browser-three] Cannot resolve type length for "${type1}" — backend does not support type inspection.`,
        );
      }
      columnLength = builder.getTypeLength(type1);
      columns = 1;
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
      const col1 = matrixLayout !== undefined ? (v1 as unknown as NodeWithElement).element(c) : v1;
      const col2 = matrixLayout !== undefined ? (v2 as unknown as NodeWithElement).element(c) : v2;
      this.writeColumn(c, padToVec4(col1, columnLength), padToVec4(col2, columnLength));
    }

    return undefined;
  }
}
