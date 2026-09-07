import { type AbiParameter, encodeAbiParameters, type Hex } from "viem";
import { ErrorException } from "../errors";
import { type HelperFunctionNode, type Node, NodeType } from "../types";
import { encodeParams } from "../utils/encoders";
import { guardAbiInteger } from "./abi-guards";
import type { CollectionCallback } from "./collections";
import {
  categoryFromAbiType,
  compileCallValue,
  compileOperand,
  PRECOMPILED_OPERAND,
} from "./compile";
import type { ArgSpec } from "./construct";
import { compileDefCall, lookupOnchainDef } from "./defs";
import { compileDirectCollectionCallback } from "./direct-callback";
import { rawParam } from "./erc8211";
import {
  abiDescriptor,
  encodeExpression,
  expressionsAddress,
} from "./expressions";
import { GraphBuilder } from "./graph";
import type { CompileCtx, Operand } from "./types";

/** Parameters bind canonical whole values. Repeated references share one graph node. */
export async function compileCollectionCallback(
  ctx: CompileCtx,
  node: Node,
  inputs: readonly AbiParameter[],
): Promise<{
  callback: CollectionCallback;
  callbackSpec: ArgSpec;
  output: AbiParameter;
}> {
  if (node.type !== NodeType.HelperFunctionExpression)
    throw new ErrorException(
      "Generic collection callback must be a named definition",
    );
  const call = node as HelperFunctionNode,
    def = lookupOnchainDef(ctx, call.name);
  if (!def || def.argDefs.length !== inputs.length)
    throw new ErrorException(
      "Generic collection callback needs a named definition with matching parameter count",
    );
  if (call.args.length)
    throw new ErrorException(
      "Collection callbacks do not accept arguments at the reference site",
    );
  // Retain the compact direct-call path when no expression graph is required.
  if (def.bodyNode.type === NodeType.CallExpression) {
    const body = def.bodyNode as import("../types").CallExpressionNode;
    const names = def.argDefs.map((p) => `$${p.name}`);
    const seen = new Set<string>();
    const simple =
      !body.bang &&
      !body.returnDestructure &&
      names.every(
        (name) => !JSON.stringify(body.target).includes(JSON.stringify(name)),
      ) &&
      body.target.type !== NodeType.CallExpression &&
      body.target.type !== NodeType.HelperFunctionExpression &&
      body.args.every((arg) => {
        if (
          arg.type === NodeType.VariableIdentifier &&
          names.includes((arg as { value: string }).value)
        ) {
          const key = (arg as { value: string }).value;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }
        const text = JSON.stringify(arg);
        return names.every((name) => !text.includes(JSON.stringify(name)));
      });
    if (simple && seen.size === names.length) {
      const direct = await compileDirectCollectionCallback(ctx, node, inputs);
      // Narrow integer results need an explicit range guard in the graph.
      const integer = /^u?int(\d+)$/.exec(direct.output.type);
      if (!integer || Number(integer[1]) === 256) return direct;
    }
  }
  const markers = new Map<string, { index: number; type: AbiParameter }>();
  const args = inputs.map((type, index) => {
    const annotation = def.argDefs[index].abiType;
    if (annotation && abiDescriptor(annotation) !== abiDescriptor(type))
      throw new ErrorException(
        `Callback annotation for $${def.argDefs[index].name} does not match ${abiDescriptor(type)}`,
      );
    const marker = encodeAbiParameters(
      [{ type: "uint256" }],
      [
        BigInt(
          `0xfacefeed${"0".repeat(54)}${index.toString(16).padStart(2, "0")}`,
        ),
      ],
    );
    markers.set(marker, { index, type });
    const operand: Operand = {
      kind: "call",
      param: rawParam(marker),
      cat:
        type.type.startsWith("tuple") || type.type.includes("[")
          ? "Bytes"
          : categoryFromAbiType(type.type),
      abiType: type,
    };
    if (type.type.endsWith("[]"))
      operand.collection = {
        element: { ...type, type: type.type.slice(0, -2) } as AbiParameter,
        transport: "abi",
      };
    return {
      type: NodeType.HelperFunctionExpression,
      name: "__graphParameter!",
      args: [],
      [PRECOMPILED_OPERAND]: operand,
    } as unknown as Node;
  });
  const operand = (await compileDefCall(
    ctx,
    def,
    { ...call, args: args as HelperFunctionNode["args"] },
    async (innerCtx, body) => {
      if (body.type === NodeType.CallExpression) {
        const value = await compileCallValue(
          innerCtx,
          body as import("../types").CallExpressionNode,
        );
        return {
          kind: "call",
          param: value.param,
          abiType: value.terminal,
          cat:
            value.terminal.type.startsWith("tuple") ||
            value.terminal.type.includes("[")
              ? "Bytes"
              : categoryFromAbiType(value.terminal.type),
        } as Operand;
      }
      return compileOperand(innerCtx, body);
    },
  )) as Operand;
  const output = def.returnAbiType ??
    (operand.kind === "call" ? operand.abiType : undefined) ?? {
      type:
        operand.cat === "Bool"
          ? "bool"
          : operand.cat === "String"
            ? "string"
            : operand.cat === "Bytes"
              ? "bytes"
              : operand.cat === "Address"
                ? "address"
                : operand.cat === "Int"
                  ? "int256"
                  : "uint256",
    };
  if (
    operand.kind === "call" &&
    operand.abiType &&
    abiDescriptor(output) !== abiDescriptor(operand.abiType)
  )
    throw new ErrorException(
      "Callback return ABI annotation does not match the compiled result",
    );
  const graph = new GraphBuilder(ctx, markers);
  const result = graph.asType(
    graph.fragment(
      operand.kind === "call"
        ? guardAbiInteger(ctx, operand.param, operand.cat, output.type)
        : rawParam(
            encodeParams(
              [output],
              [operand.value] as never,
              "collection callback result",
            ),
          ),
    ),
    output,
  );
  const callback: CollectionCallback = {
    target: expressionsAddress(ctx),
    selector: "0x00000000",
    arguments: `(${inputs.map(abiDescriptor).join(",")})`,
    constants: inputs.map(() => "0x" as Hex),
    first: 0n,
    second: inputs.length > 1 ? 1n : 0n,
    expression: encodeExpression(graph.build(result)),
  };
  return {
    callback,
    callbackSpec: { kind: "value", value: callback as never },
    output,
  };
}

/** Equality of canonical ABI values, including dynamic tuples and arrays. */
export function abiEqualityCallback(
  ctx: CompileCtx,
  type: AbiParameter,
): ArgSpec {
  const graph = new GraphBuilder(ctx);
  const hashes = [0, 1].map((i) =>
    graph.operation("hash", [graph.wrap(graph.parameter(type, i))], "uint256"),
  );
  const result = graph.operation("eq", hashes, "bool");
  const callback: CollectionCallback = {
    target: expressionsAddress(ctx),
    selector: "0x00000000",
    arguments: `(${abiDescriptor(type)},${abiDescriptor(type)})`,
    constants: ["0x", "0x"],
    first: 0n,
    second: 1n,
    expression: encodeExpression(graph.build(result)),
  };
  return { kind: "value", value: callback as never };
}
