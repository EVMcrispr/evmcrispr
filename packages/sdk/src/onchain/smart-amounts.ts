import type { AbiFunction, AbiParameter, Address } from "viem";
import { parseAbiItem } from "viem";
import { ErrorException } from "../errors";
import type { Module } from "../Module";
import { Num } from "../utils/Num";
import { canonicalArgSpec } from "./collections";
import { lensSelectData } from "./compile";
import { buildCall, callParam, headWords, isDynamicParam } from "./construct";
import { encodePick, encodeResolve } from "./core";
import { constraint, staticCallParam, targetParam } from "./erc8211";
import { getSmartCompileContext, runtimeValue, smartValueParam } from "./smart";
import { isRuntimeValue, type RuntimeValue } from "./smart-types";
import { constrainWord } from "./word-constraints";

export type SmartAmount = bigint | RuntimeValue;
/** Pass symbolic amounts to the shared call builder without numeric coercion. */
export const amountParam = (amount: SmartAmount): Num | RuntimeValue =>
  isRuntimeValue(amount) ? amount : Num.fromBigInt(amount);

export function positiveRuntimeAmount(
  module: Module,
  value: RuntimeValue,
): RuntimeValue {
  const ctx = getSmartCompileContext(module);
  if (!ctx) throw new ErrorException("runtime amounts require a smart batch");
  const param = smartValueParam(ctx, { type: "uint256" }, value);
  // Both executors use positional constraints; merge guards on this word.
  return runtimeValue(
    staticCallParam(
      ctx.core,
      encodeResolve(constrainWord(ctx, param, constraint("Gte", 1n))),
    ),
    { type: "uint256" },
    value.batchId,
  );
}

export function smartRead(
  module: Module,
  target: Address,
  signature: string,
  args: unknown[],
  output: AbiParameter = { type: "uint256" },
): RuntimeValue {
  const ctx = getSmartCompileContext(module);
  if (!ctx) throw new ErrorException("runtime reads require a smart batch");
  const fn = parseAbiItem(`function ${signature}`) as AbiFunction;
  const specs = fn.inputs.map((type, i) =>
    canonicalArgSpec(ctx, type, smartValueParam(ctx, type, args[i])),
  );
  return runtimeValue(
    callParam(ctx, targetParam(target), buildCall(ctx, fn, specs)),
    output,
    ctx.interpreters.batchContext!.smartState!.plan.salt,
  );
}

/** Snapshot a derived protocol amount before approvals can affect its inputs. */
export async function snapshotSmartAmount(
  module: Module,
  value: SmartAmount,
): Promise<SmartAmount> {
  if (!isRuntimeValue(value)) return value;
  const ctx = getSmartCompileContext(module);
  if (!ctx) throw new ErrorException("runtime amounts require a smart batch");
  return ctx.interpreters.batchContext!.smartState!.snapshot(ctx, value);
}

/** Preserve checked integer semantics for protocol-side scaling and limits. */
export async function smartArithmetic(
  module: Module,
  operator: "+" | "-" | "*" | "/",
  left: SmartAmount,
  right: SmartAmount,
): Promise<SmartAmount> {
  if (!isRuntimeValue(left) && !isRuntimeValue(right)) {
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    return left / right;
  }
  const ctx = getSmartCompileContext(module);
  if (!ctx)
    throw new ErrorException("runtime arithmetic requires a smart batch");
  const { compileCheckedExpr, operandNode, constOperand } = await import(
    "./compile"
  );
  const { NodeType } = await import("../types");
  const operand = await compileCheckedExpr(ctx, [
    operandNode(
      isRuntimeValue(left) ? left.operand : constOperand(Num.fromBigInt(left)),
    ),
    { type: NodeType.Bareword, value: operator === "/" ? "//" : operator },
    operandNode(
      isRuntimeValue(right)
        ? right.operand
        : constOperand(Num.fromBigInt(right)),
    ),
  ]);
  if (operand.kind !== "call")
    throw new ErrorException("expected a runtime arithmetic result");
  return runtimeValue(
    operand.param,
    { type: operand.cat === "Int" ? "int256" : "uint256" },
    ctx.interpreters.batchContext!.smartState!.plan.salt,
    operand,
  );
}

/** Apply a protocol range to the resolved word without evaluating a preview. */
export function boundedRuntimeAmount(
  module: Module,
  value: RuntimeValue,
  min: bigint,
  max: bigint,
  abiType = "uint256",
): RuntimeValue {
  const ctx = getSmartCompileContext(module);
  if (!ctx) throw new ErrorException("runtime amounts require a smart batch");
  const param = smartValueParam(ctx, { type: abiType }, value);
  return runtimeValue(
    staticCallParam(
      ctx.core,
      encodeResolve(
        constrainWord(
          ctx,
          constrainWord(ctx, param, constraint("Gte", min)),
          constraint("Lte", max),
        ),
      ),
    ),
    { type: abiType },
    value.batchId,
  );
}

/** A live read selecting one declared ABI result. */
export function smartReadOutput(
  module: Module,
  target: Address,
  signature: string,
  args: unknown[],
  index: number,
): RuntimeValue {
  const ctx = getSmartCompileContext(module);
  if (!ctx) throw new ErrorException("runtime reads require a smart batch");
  const fn = parseAbiItem(`function ${signature}`) as AbiFunction;
  const base = smartRead(module, target, signature, args);
  const output = fn.outputs[index];
  if (!output) throw new ErrorException("missing ABI output");
  if (isDynamicParam(output) || headWords(output) !== 1)
    throw new ErrorException(
      "smartReadOutput requires a single static ABI word; use smartReadLens for compound results",
    );
  const word = fn.outputs
    .slice(0, index)
    .reduce((total, p) => total + (isDynamicParam(p) ? 1 : headWords(p)), 0);
  // Pick validates returndata length; it cannot turn short data into a stale value.
  return runtimeValue(
    staticCallParam(ctx.core, encodePick(base.operand.param, BigInt(word))),
    output,
    base.batchId,
  );
}

export function smartOperation(
  module: Module,
  name: "min" | "max" | "bitOr",
  left: SmartAmount,
  right: SmartAmount,
): SmartAmount {
  if (!isRuntimeValue(left) && !isRuntimeValue(right))
    return name === "min"
      ? left < right
        ? left
        : right
      : name === "max"
        ? left > right
          ? left
          : right
        : left | right;
  const ctx = getSmartCompileContext(module);
  if (!ctx)
    throw new ErrorException("runtime operations require a smart batch");
  return smartRead(
    module,
    ctx.operators,
    `${name}(uint256,uint256) returns (uint256)`,
    [amountParam(left), amountParam(right)],
  );
}

/** Select a nested ABI result using the same validated lens as inline calls. */
export function smartReadLens(
  module: Module,
  target: Address,
  signature: string,
  args: unknown[],
  slots: unknown[],
): RuntimeValue {
  const ctx = getSmartCompileContext(module);
  if (!ctx) throw new ErrorException("runtime reads require a smart batch");
  const fn = parseAbiItem(`function ${signature}`) as AbiFunction;
  const base = smartRead(module, target, signature, args);
  const lens = lensSelectData(base.operand.param, fn.outputs, slots, signature);
  return runtimeValue(
    staticCallParam(ctx.core, lens.data),
    lens.terminal,
    base.batchId,
  );
}

/** A protocol precondition evaluated in order, before any prerequisite calls. */
export async function assertSmartComparison(
  module: Module,
  left: SmartAmount,
  operator: ">" | ">=" | "<" | "<=",
  right: SmartAmount,
  message: string,
): Promise<void> {
  if (!isRuntimeValue(left) && !isRuntimeValue(right)) {
    const ok =
      operator === ">"
        ? left > right
        : operator === ">="
          ? left >= right
          : operator === "<"
            ? left < right
            : left <= right;
    if (!ok) throw new ErrorException(message);
    return;
  }
  const ctx = getSmartCompileContext(module);
  if (!ctx)
    throw new ErrorException("runtime assertions require a smart batch");
  const { compileAssertion, assertionAction } = await import("./assertion");
  const { operandNode, constOperand } = await import("./compile");
  const { NodeType } = await import("../types");
  const node = (value: SmartAmount) =>
    operandNode(
      isRuntimeValue(value)
        ? value.operand
        : constOperand(Num.fromBigInt(value)),
    );
  const compiled = await compileAssertion(ctx, {
    call: node(left),
    operator,
    expected: node(right),
    message,
  });
  await ctx.interpreters.batchContext!.smartState!.append(
    module,
    {
      type: NodeType.CommandExpression,
      name: "protocol-bound",
      args: [],
      opts: [],
    },
    { actions: [assertionAction(compiled)] },
  );
}
