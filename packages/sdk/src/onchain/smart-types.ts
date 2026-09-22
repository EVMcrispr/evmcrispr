import type { AbiFunction, AbiParameter, Address, Hex } from "viem";
import type { Module } from "../Module";
import type {
  Action,
  CommandExpressionNode,
  TransactionAction,
} from "../types";
import type { ComposableExecution, InputParam } from "./erc8211";
import type { CompileCtx, Operand } from "./types";

/** A typed value resolved by the executor, never a JavaScript preview. */
export interface RuntimeValue {
  readonly kind: "runtime-value";
  readonly operand: Operand & { kind: "call" };
  readonly abiType: AbiParameter;
  readonly batchId: Hex;
  /** Producer position, retained for typed plans and review. */
  readonly output?: { step: number; word: number };
}

export function isRuntimeValue(value: unknown): value is RuntimeValue {
  return (
    !!value &&
    typeof value === "object" &&
    (value as RuntimeValue).kind === "runtime-value"
  );
}

export function hasRuntimeValue(value: unknown): boolean {
  if (isRuntimeValue(value)) return true;
  if (Array.isArray(value)) return value.some(hasRuntimeValue);
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).some(hasRuntimeValue)
  );
}

/** An unencoded call. Consumed during compilation; never sent to a wallet. */
export interface PlannedCall {
  target: Address | RuntimeValue;
  /** Exact fixed calldata for a call with a dynamic target/value. */
  rawData?: Hex;
  /** Resolved argument bytes following rawData's fixed selector. */
  rawInput?: InputParam;
  abi: AbiFunction;
  args: unknown[];
  value?: bigint | RuntimeValue;
}

/** Serializable ABI values; numeric constants are canonical integer values. */
export type SmartBatchValue =
  | string
  | bigint
  | boolean
  | RuntimeValue
  | SmartBatchValue[]
  | { [name: string]: SmartBatchValue };
export interface SmartBatchCall {
  target: Address | RuntimeValue;
  abi: AbiFunction;
  args: SmartBatchValue[];
  value: bigint | RuntimeValue;
  rawData?: Hex;
  rawInput?: InputParam;
}

export type SmartBatchStep =
  | {
      kind: "composable";
      execution: ComposableExecution;
      /** Retain typed expressions alongside their route-specific wire encoding. */
      call?: SmartBatchCall;
      dynamicFields?: string[];
      /** A snapshotted predicate; false skips the call and its input reads. */
      condition?: RuntimeValue;
      reads?: { name: string; step: number; word: number }[];
      label: string;
      line?: number;
    }
  | {
      kind: "transaction";
      action: TransactionAction;
      label: string;
      line?: number;
    };

export interface SmartBatchPlan {
  version: 1;
  salt: Hex;
  chainId: number;
  account: Address;
  /** Output storage's writer differs between these authenticated routes. */
  route: "delegatecall" | "executor";
  executor: Address;
  storage: Address;
  steps: SmartBatchStep[];
  captures: { name: string; type: AbiParameter; step: number; word: number }[];
  /** Contracts used by runtime expressions, checked before submission. */
  dependencies: Address[];
}

export interface SmartCommandPlan {
  actions: Action[];
  /** Index of the call whose ABI outputs a -> [...] clause captures. */
  primaryCall?: number;
}

export interface SmartCompileCtx extends CompileCtx {
  batch: SmartBatchState;
}

export type CommandCompile = (
  ctx: SmartCompileCtx,
  node: CommandExpressionNode,
) => Promise<SmartCommandPlan>;

/** One lexical loop; each flag refers to a frozen boolean in batch storage. */
export interface SmartLoopFrame {
  parent?: SmartLoopFrame;
  active?: RuntimeValue;
  iteration?: RuntimeValue;
  runtimeControl?: boolean;
}

export function hasSmartCondition(state: SmartBatchState): boolean {
  if (state.condition) return true;
  for (let loop = state.loop; loop; loop = loop.parent)
    if (loop.active || loop.iteration) return true;
  return false;
}

/** Interpretation-only state; the finished plan contains no closures or AST. */
export interface SmartBatchState {
  plan: SmartBatchPlan;
  condition?: RuntimeValue;
  loop?: SmartLoopFrame;
  snapshots: WeakMap<RuntimeValue, RuntimeValue>;
  append(
    module: Module,
    node: CommandExpressionNode,
    result: SmartCommandPlan,
  ): Promise<void>;
  snapshot(
    ctx: CompileCtx,
    value: RuntimeValue,
    options?: { control?: boolean },
  ): Promise<RuntimeValue>;
}

export interface SmartBatchAction {
  type: "smartBatch";
  chainId: number;
  from: Address;
  plan: SmartBatchPlan;
}

export type SmartInput = InputParam;
