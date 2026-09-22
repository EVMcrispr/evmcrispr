import { ErrorException } from "../errors";
import type { Module } from "../Module";
import { NodeType } from "../types";
import { Num } from "../utils/Num";
import { assertParamAction } from "./assert";
import { cmpCombine, constOperand } from "./compile";
import { encodeCond } from "./core";
import { constraint, rawParam, staticCallParam, toWord } from "./erc8211";
import {
  getSmartCompileContext,
  runtimeValue,
  smartCondition,
  smartValueParam,
} from "./smart";
import {
  assertSmartComparison,
  type SmartAmount,
  smartArrayLength,
  smartValueElement,
  snapshotSmartAmount,
  snapshotSmartValue,
} from "./smart-amounts";
import {
  isRuntimeValue,
  type RuntimeValue,
  type SmartLoopFrame,
} from "./smart-types";
import { constrainWord } from "./word-constraints";

function context(module: Module) {
  const ctx = getSmartCompileContext(module);
  if (!ctx)
    throw new ErrorException("runtime control flow requires a smart batch");
  return ctx;
}

export function smartNot(module: Module, value: RuntimeValue): RuntimeValue {
  const ctx = context(module);
  return runtimeValue(
    staticCallParam(
      ctx.core,
      encodeCond(
        smartValueParam(ctx, { type: "bool" }, value),
        rawParam(toWord(0n)),
        rawParam(toWord(1n)),
      ),
    ),
    { type: "bool" },
    value.batchId,
  );
}

export function smartLessThan(
  module: Module,
  left: SmartAmount,
  right: SmartAmount,
): boolean | RuntimeValue {
  if (!isRuntimeValue(left) && !isRuntimeValue(right)) return left < right;
  const ctx = context(module);
  const result = cmpCombine(
    ctx,
    "Lt",
    isRuntimeValue(left) ? left.operand : constOperand(Num.fromBigInt(left)),
    isRuntimeValue(right) ? right.operand : constOperand(Num.fromBigInt(right)),
  );
  if (result.kind === "const") return result.value === true;
  return runtimeValue(
    result.param,
    { type: "bool" },
    ctx.interpreters.batchContext!.smartState!.plan.salt,
    result,
  );
}

/** Freeze a predicate before its body can change the state it reads. */
export async function withSmartCondition<T>(
  module: Module,
  condition: boolean | RuntimeValue,
  run: () => Promise<T>,
): Promise<T | undefined> {
  if (condition === false) return;
  if (condition === true) return run();
  const ctx = context(module);
  const state = ctx.interpreters.batchContext!.smartState!;
  const parent = state.condition;
  let param = smartValueParam(ctx, { type: "bool" }, condition);
  if (parent)
    param = staticCallParam(
      ctx.core,
      encodeCond(parent.operand.param, param, rawParam(toWord(0n))),
    );
  const predicate =
    !parent && condition.output
      ? condition
      : await state.snapshot(
          ctx,
          runtimeValue(param, { type: "bool" }, condition.batchId),
        );
  ctx.interpreters.batchContext!.hasActions = true;
  state.condition = predicate;
  try {
    return await run();
  } finally {
    state.condition = parent;
  }
}

/** Loop flags remain local to the nearest loop, including fixed unrollings. */
export async function withSmartLoop<T>(
  module: Module,
  run: (frame?: SmartLoopFrame) => Promise<T>,
): Promise<T> {
  const state =
    getSmartCompileContext(module)?.interpreters.batchContext?.smartState;
  if (!state) return run();
  const parent = state.loop;
  const frame: SmartLoopFrame = { parent };
  state.loop = frame;
  try {
    return await run(frame);
  } finally {
    state.loop = parent;
  }
}

/** Return false for ordinary build-time control flow, leaving JS signals intact. */
export async function smartLoopControl(
  module: Module,
  kind: "break" | "continue",
): Promise<boolean> {
  const ctx = getSmartCompileContext(module);
  if (!ctx) return false;
  const state = ctx.interpreters.batchContext!.smartState!;
  const frame = state.loop;
  const condition = smartCondition(ctx);
  if (!condition) return false;
  if (!frame)
    throw new ErrorException(`loop ${kind} can only be used inside a loop`);

  // This snapshot is zero when the branch is skipped. The following flag
  // update must run outside the branch guard so an untaken exit preserves
  // the previous flag instead of replacing it with the snapshot's zero.
  const taken = await state.snapshot(ctx, condition);
  const previous = kind === "break" ? frame.active : frame.iteration;
  const next = runtimeValue(
    staticCallParam(
      ctx.core,
      encodeCond(
        taken.operand.param,
        rawParam(toWord(0n)),
        previous?.operand.param ?? rawParam(toWord(1n)),
      ),
    ),
    { type: "bool" },
    state.plan.salt,
  );
  const flag = await state.snapshot(ctx, next, { control: true });
  if (kind === "break") frame.active = flag;
  else frame.iteration = flag;
  frame.runtimeControl = true;
  ctx.interpreters.batchContext!.hasActions = true;
  return true;
}

/** A def body inherits its caller's guard, but cannot break the caller's loop. */
export async function withSmartLoopBoundary<T>(
  module: Module,
  interpreters: import("../types").NodesInterpreters,
  run: () => Promise<T>,
): Promise<T> {
  const state = interpreters.batchContext?.smartState;
  if (!state) return run();
  const { defaultCompileCtx } = await import("./assertion");
  const previousLoop = state.loop;
  const previousCondition = state.condition;
  state.condition = smartCondition(defaultCompileCtx(module, interpreters));
  state.loop = undefined;
  try {
    return await run();
  } finally {
    state.loop = previousLoop;
    state.condition = previousCondition;
  }
}

/** Runtime loops are bounded unrollings; exceeding the bound reverts atomically. */
export function smartIterationLimit(value: unknown = 32): number {
  const n = Num(value);
  if (!n.isInteger() || n.lt(Num(1)) || n.gt(Num(256)))
    throw new ErrorException(
      "runtime iteration limit must be an integer between 1 and 256",
    );
  return Number(n.toBigInt());
}

/** Snapshot every selected element before running any iteration's writes. */
export async function forEachSmartArray(
  module: Module,
  array: RuntimeValue,
  limit: number,
  run: (item: any, index: number) => Promise<boolean | void>,
  prepare?: (item: RuntimeValue, index: number) => Promise<unknown>,
  beforeIteration?: () => void,
): Promise<void> {
  const length = await snapshotSmartAmount(
    module,
    smartArrayLength(module, array),
  );
  await assertSmartComparison(
    module,
    length,
    "<=",
    BigInt(limit),
    "runtime array exceeds the iteration limit",
  );
  const items: {
    selected: boolean | RuntimeValue;
    value: unknown;
    index: number;
  }[] = [];
  for (let i = 0; i < limit; i++) {
    const selected = smartLessThan(module, BigInt(i), length);
    await withSmartCondition(module, selected, async () => {
      const item = await snapshotSmartValue(
        module,
        smartValueElement(module, array, i),
      );
      items.push({
        selected,
        value: prepare ? await prepare(item, i) : item,
        index: i,
      });
    });
  }
  for (const item of items) {
    beforeIteration?.();
    let stop = false;
    await withSmartCondition(module, item.selected, async () => {
      stop = (await run(item.value, item.index)) === false;
    });
    if (stop) break;
  }
}

export async function assertSmartBoolean(
  module: Module,
  value: boolean | RuntimeValue,
  message: string,
): Promise<void> {
  const ctx = context(module);
  const param = isRuntimeValue(value)
    ? smartValueParam(ctx, { type: "bool" }, value)
    : rawParam(toWord(value ? 1n : 0n));
  await ctx.interpreters.batchContext!.smartState!.append(
    module,
    {
      type: NodeType.CommandExpression,
      name: "loop-bound",
      args: [],
      opts: [],
    },
    {
      actions: [
        assertParamAction(
          constrainWord(ctx, param, constraint("Eq", 1n)),
          message,
        ),
      ],
    },
  );
}

export async function runSmartUntil(
  module: Module,
  read: () => Promise<boolean | RuntimeValue>,
  run: () => Promise<boolean>,
  limit: number,
): Promise<void> {
  const state = context(module).interpreters.batchContext!.smartState!;
  let active: boolean | RuntimeValue = true;
  for (let i = 0; i <= limit; i++) {
    if (state.loop) state.loop.iteration = undefined;
    let stop = false;
    await withSmartCondition(module, active, async () => {
      const finished = await read();
      if (i === limit) {
        await assertSmartBoolean(
          module,
          finished,
          "runtime loop exceeded its iteration limit",
        );
        return;
      }
      const next = isRuntimeValue(finished)
        ? smartNot(module, finished)
        : !finished;
      if (next === false) {
        active = false;
        return;
      }
      await withSmartCondition(module, next, async () => {
        active = state.condition ?? true;
        stop = !(await run());
      });
    });
    if (stop || (active as boolean | RuntimeValue) === false) break;
  }
}
