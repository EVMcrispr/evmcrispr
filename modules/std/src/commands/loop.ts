import type { Action, BlockExpressionNode, Node } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  coerceBoolean,
  defineCommand,
  ErrorException,
  fieldItem,
  isBoolean,
  variableItem,
} from "@evmcrispr/sdk";
import type Std from "..";

const { USER } = BindingsSpace;

const MAX_ITERATIONS = 10_000;

export default defineCommand<Std>({
  name: "loop",
  description:
    "Repeat a block: iterate over an array (`loop $x of $arr`) or until a condition is true (`loop until <condition>`).",
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
        "Keyword `of` (iterate an array) or `until` (repeat while false)",
    },
    {
      name: "value",
      type: "expression",
      description: "Array to iterate over, or exit condition",
    },
    { name: "block", type: "block", description: "Commands to repeat" },
  ],
  completions: {
    variable: (ctx) => [
      fieldItem("until"),
      ...ctx.bindings
        .getAllBindingIdentifiers({ spaceFilters: [USER] })
        .map(variableItem),
    ],
    connector: () => [fieldItem("of")],
  },
  async run(module, { variable, connector, value, block }, { interpreters }) {
    const { interpretNode, actionCallback } = interpreters;
    const blockOpts = { actionCallback };
    const actions: Action[] = [];

    if (connector !== "of" && connector !== "until") {
      throw new ErrorException(`expected "of" or "until", got "${connector}"`);
    }

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
          if (iterations++ >= MAX_ITERATIONS) {
            throw new ErrorException("loop: exceeded 10,000 iterations");
          }
          const condition = await interpretNode(value as Node);
          if (!isBoolean(condition)) {
            throw new ErrorException(
              `<condition> must be a boolean, got ${condition}`,
            );
          }
          if (coerceBoolean(condition)) break;
          actions.push(
            ...((await interpretNode(
              block as BlockExpressionNode,
              blockOpts,
            )) as Action[]),
          );
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

    const items = await interpretNode(value as Node);
    if (!Array.isArray(items)) {
      throw new ErrorException(`<value> must be an array, got ${items}`);
    }

    module.bindingsManager.enterScope();
    try {
      for (const item of items) {
        module.bindingsManager.setBinding(
          variable,
          item,
          USER,
          false,
          undefined,
          true,
        );
        actions.push(
          ...((await interpretNode(
            block as BlockExpressionNode,
            blockOpts,
          )) as Action[]),
        );
      }
    } finally {
      module.bindingsManager.exitScope();
    }
    return actions;
  },
});
