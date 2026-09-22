import type { Action, BlockExpressionNode, Node } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  BreakSignal,
  ContinueSignal,
  ControlFlowSignal,
  coerceBoolean,
  defineCommand,
  ErrorException,
  fieldItem,
  isBoolean,
  variableItem,
} from "@evmcrispr/sdk";
import {
  defaultCompileCtx,
  forEachSmartArray,
  interpretSmartValue,
  isRuntimeValue,
  runSmartUntil,
  smartIterationLimit,
  smartLoopControl,
  smartValueElement,
  snapshotSmartValue,
  withSmartLoop,
} from "@evmcrispr/sdk/onchain";
import type Std from "..";

const { USER } = BindingsSpace;

const MAX_ITERATIONS = 10_000;

export default defineCommand<Std>({
  smartSupport: {
    kind: "runtime",
    reason:
      "Runtime loops and runtime-dependent break/continue compile to conditional steps; --max-iterations defaults to 32 (maximum 256).",
  },
  name: "loop",
  description:
    "Repeat a block: iterate over an array (`loop $x of $arr`), repeat until a condition is true (`loop until <condition>`), or exit/skip an iteration from inside the block (`loop break`, `loop continue`).",
  args: [
    {
      name: "variable",
      type: "variable",
      optional: true,
      description: "Loop variable, bound per element (iteration form)",
    },
    {
      name: "connector",
      type: "command",
      description:
        "Keyword `of` (iterate an array), `until` (repeat while false), `break` or `continue` (inside a loop block)",
    },
    {
      name: "value",
      runtime: true,
      type: "expression",
      optional: true,
      description: "Array to iterate over, or exit condition",
    },
    {
      name: "block",
      type: "block",
      optional: true,
      description: "Commands to repeat",
    },
  ],
  opts: [
    {
      name: "max-iterations",
      type: "number",
      description:
        "Maximum runtime iterations (default 32, at most 256); exceeding it reverts the batch",
    },
  ],
  completions: {
    variable: (ctx) => [
      fieldItem("until"),
      fieldItem("break"),
      fieldItem("continue"),
      ...ctx.bindings
        .getAllBindingIdentifiers({ spaceFilters: [USER] })
        .map(variableItem),
    ],
    connector: () => [fieldItem("of")],
  },
  async run(
    module,
    { variable, connector, value, block },
    { interpreters, opts },
  ) {
    const { interpretNode, actionCallback } = interpreters;
    const blockOpts = { actionCallback };
    const actions: Action[] = [];

    // Control-flow forms: `loop break` / `loop continue`. The signal
    // unwinds to the nearest enclosing loop (def bodies are a boundary).
    if (connector === "break" || connector === "continue") {
      if (
        variable !== undefined ||
        value !== undefined ||
        block !== undefined
      ) {
        throw new ErrorException(`"loop ${connector}" takes no arguments`);
      }
      if (await smartLoopControl(module, connector)) return [];
      throw connector === "break" ? new BreakSignal() : new ContinueSignal();
    }

    if (connector !== "of" && connector !== "until") {
      throw new ErrorException(
        `expected "of", "until", "break" or "continue", got "${connector}"`,
      );
    }

    if (block === undefined) {
      throw new ErrorException(`<block> must be a block expression`);
    }
    if (value === undefined) {
      throw new ErrorException(
        connector === "of"
          ? "<value> must be an array to iterate over"
          : "<value> must be an exit condition",
      );
    }

    // Interpret one pass of the block, translating control-flow signals:
    // returns "break" when the loop should stop, "continue" otherwise. A
    // signal carries the actions the interrupted iteration already produced.
    const runBlock = async (): Promise<"break" | "continue"> => {
      try {
        actions.push(
          ...((await interpretNode(
            block as BlockExpressionNode,
            blockOpts,
          )) as Action[]),
        );
      } catch (err) {
        if (err instanceof BreakSignal || err instanceof ContinueSignal) {
          actions.push(...(err.actions as Action[]));
          return err instanceof BreakSignal ? "break" : "continue";
        }
        // A signal passing through (`def return`, `exit`) takes the
        // completed iterations' actions with it.
        if (err instanceof ControlFlowSignal) {
          err.actions = [...actions, ...err.actions];
        }
        throw err;
      }
      return "continue";
    };

    return withSmartLoop(module, async (frame) => {
      // Until form: `loop until <condition> ( ... )`
      if (connector === "until") {
        if (variable !== undefined) {
          throw new ErrorException(
            "the until form takes no loop variable (use `loop until <condition>`)",
          );
        }

        module.bindingsManager.enterScope();
        try {
          let iterations = 0;
          while (true) {
            if (frame) frame.iteration = undefined;
            if (iterations++ >= MAX_ITERATIONS) {
              throw new ErrorException("loop: exceeded 10,000 iterations");
            }
            const condition = interpreters.batchContext?.smartState
              ? await interpretSmartValue(
                  defaultCompileCtx(module, interpreters),
                  value as Node,
                )
              : await interpretNode(value as Node);
            if (isRuntimeValue(condition) || frame?.runtimeControl) {
              let first = true;
              await runSmartUntil(
                module,
                async () => {
                  const result = first
                    ? condition
                    : await interpretSmartValue(
                        defaultCompileCtx(module, interpreters),
                        value as Node,
                      );
                  first = false;
                  return isRuntimeValue(result)
                    ? result
                    : coerceBoolean(result);
                },
                async () => (await runBlock()) !== "break",
                Math.max(
                  0,
                  smartIterationLimit(opts["max-iterations"]) -
                    (iterations - 1),
                ),
              );
              break;
            }
            if (!isBoolean(condition)) {
              throw new ErrorException(
                `<condition> must be a boolean, got ${condition}`,
              );
            }
            if (coerceBoolean(condition)) break;
            if ((await runBlock()) === "break") break;
          }
        } finally {
          module.bindingsManager.exitScope();
        }
        return actions;
      }

      // Iteration form: `loop $x of <array> ( ... )`
      if (typeof variable !== "string") {
        throw new ErrorException("<variable> must be a $variable");
      }

      const smart = interpreters.batchContext?.smartState;
      let items = smart
        ? await interpretSmartValue(
            defaultCompileCtx(module, interpreters),
            value as Node,
          )
        : await interpretNode(value as Node);
      if (isRuntimeValue(items)) {
        const length = items.abiType.type.match(/\[(\d+)\]$/)?.[1];
        if (!length) {
          module.bindingsManager.enterScope();
          try {
            await forEachSmartArray(
              module,
              items,
              smartIterationLimit(opts["max-iterations"]),
              async (item) => {
                module.bindingsManager.setBinding(
                  variable,
                  item,
                  USER,
                  false,
                  undefined,
                  true,
                );
                return (await runBlock()) !== "break";
              },
              undefined,
              () => {
                if (frame) frame.iteration = undefined;
              },
            );
          } finally {
            module.bindingsManager.exitScope();
          }
          return actions;
        }
        if (Number(length) > MAX_ITERATIONS)
          throw new ErrorException("loop: exceeded 10,000 iterations");
        const source = items;
        items = Array.from({ length: Number(length) }, (_, i) =>
          smartValueElement(module, source, i),
        );
      }
      if (!Array.isArray(items)) {
        throw new ErrorException(`<value> must be an array, got ${items}`);
      }

      if (smart) items = await snapshotSmartValue(module, items);

      module.bindingsManager.enterScope();
      try {
        for (const item of items) {
          if (frame) frame.iteration = undefined;
          module.bindingsManager.setBinding(
            variable,
            item,
            USER,
            false,
            undefined,
            true,
          );
          if ((await runBlock()) === "break") break;
        }
      } finally {
        module.bindingsManager.exitScope();
      }
      return actions;
    });
  },
});
