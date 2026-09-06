import {
  type AbiParameter,
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  parseAbi,
} from "viem";
import { EXPRESSION_RESOLVER_ADDRESS } from "./addresses";
import { type InputParam, staticCallParam } from "./erc8211";
import type { CompileCtx } from "./types";

export const EXPRESSION_RESOLVER_ABI = parseAbi([
  "struct Constraint { uint8 constraintType; bytes referenceData; }",
  "struct InputParam { uint8 paramType; uint8 fetcherType; bytes paramData; Constraint[] constraints; }",
  "struct Node { uint8 kind; string valueType; bytes data; uint256[] refs; bytes4 selector; string arguments; }",
  "struct Program { address core; Node[] nodes; uint256 result; }",
  "function resolveCall(address core,InputParam target,bytes4 selector,string argumentTypes,InputParam[] args) view",
  "function resolveArguments(address core,string argumentTypes,InputParam[] args) view",
  "function resolveValues(address core,InputParam[] args) view returns (bytes[])",
  "function evaluate(Program program,bytes[] parameters) view",
  "function evaluateEncoded(bytes program,bytes[] parameters) view",
]);
export const PROGRAM_TYPE = (
  EXPRESSION_RESOLVER_ABI.find(
    (f) => f.type === "function" && f.name === "evaluate",
  ) as { inputs: readonly AbiParameter[] }
).inputs[0];
export type ProgramNode = {
  kind: number;
  valueType: string;
  data: Hex;
  refs: bigint[];
  selector: Hex;
  arguments: string;
};
export type ExpressionProgram = {
  core: Address;
  nodes: ProgramNode[];
  result: bigint;
};
export function encodeProgram(program: ExpressionProgram): Hex {
  return encodeAbiParameters([PROGRAM_TYPE], [program]);
}
export function resolverAddress(ctx: CompileCtx): Address {
  return ctx.resolver ?? EXPRESSION_RESOLVER_ADDRESS;
}
export function resolveArgumentsParam(
  ctx: CompileCtx,
  argumentTypes: string,
  args: readonly InputParam[],
): InputParam {
  return staticCallParam(
    resolverAddress(ctx),
    encodeFunctionData({
      abi: EXPRESSION_RESOLVER_ABI,
      functionName: "resolveArguments",
      args: [ctx.core, argumentTypes, args],
    }),
  );
}
export function resolveValuesParam(
  ctx: CompileCtx,
  args: readonly InputParam[],
): InputParam {
  return staticCallParam(
    resolverAddress(ctx),
    encodeFunctionData({
      abi: EXPRESSION_RESOLVER_ABI,
      functionName: "resolveValues",
      args: [ctx.core, args],
    }),
  );
}
export function resolveCallParam(
  ctx: CompileCtx,
  target: InputParam,
  selector: Hex,
  argumentTypes: string,
  args: readonly InputParam[],
): InputParam {
  return staticCallParam(
    resolverAddress(ctx),
    encodeFunctionData({
      abi: EXPRESSION_RESOLVER_ABI,
      functionName: "resolveCall",
      args: [ctx.core, target, selector, argumentTypes, args],
    }),
  );
}
export function abiDescriptor(p: AbiParameter): string {
  return p.type.startsWith("tuple")
    ? `(${(p as { components: readonly AbiParameter[] }).components.map(abiDescriptor).join(",")})${p.type.slice(5)}`
    : p.type;
}
export function argumentDescriptor(params: readonly AbiParameter[]): string {
  return `(${params.map(abiDescriptor).join(",")})`;
}
