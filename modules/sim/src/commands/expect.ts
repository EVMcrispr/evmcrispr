import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  fieldItem,
  isNumberish,
  variableItem,
} from "@evmcrispr/sdk";
import type Sim from "..";

const { USER } = BindingsSpace;

function oppositeOp(operator: string): string {
  switch (operator) {
    case "==":
      return "!=";
    case "!=":
      return "==";
    case ">":
      return "<=";
    case ">=":
      return "<";
    case "<":
      return ">=";
    case "<=":
      return ">";
    default:
      throw new ErrorException(`Operator ${operator} not recognized`);
  }
}

export default defineCommand<Sim>({
  name: "expect",
  args: [
    { name: "value", type: "any" },
    { name: "operator", type: "string" },
    { name: "expectedValue", type: "any" },
  ],
  completions: {
    value: (ctx) =>
      ctx.bindings
        .getAllBindingIdentifiers({ spaceFilters: [USER] })
        .map(variableItem),
    operator: () => ["==", "!=", "<", "<=", ">", ">="].map(fieldItem),
    expectedValue: (ctx) =>
      ctx.bindings
        .getAllBindingIdentifiers({ spaceFilters: [USER] })
        .map(variableItem),
  },
  async run(module, { value, operator, expectedValue }, { node }) {
    const [valueNode, , expectedValueNode] = node.args;

    let result;

    switch (operator) {
      case "==":
        result = value === expectedValue;
        break;
      case "!=":
        result = value !== expectedValue;
        break;
      case ">":
      case ">=":
      case "<":
      case "<=":
        if (!isNumberish(value) || !isNumberish(expectedValue)) {
          throw new ErrorException(
            `Operator ${operator} must be used between two numbers`,
          );
        }
        if (operator === ">") result = BigInt(value) > BigInt(expectedValue);
        if (operator === ">=") result = BigInt(value) >= BigInt(expectedValue);
        if (operator === "<") result = BigInt(value) < BigInt(expectedValue);
        if (operator === "<=") result = BigInt(value) <= BigInt(expectedValue);
        break;
      default:
        throw new ErrorException(`Operator ${operator} not recognized`);
    }

    module.context.log(
      `${result ? ":success: Success" : ":error: Assertion error"}: expected ${
        valueNode.value ?? value
      } ${operator} ${expectedValueNode.value ?? expectedValue}${
        !result
          ? `, but ${value} ${oppositeOp(operator)} ${expectedValue}.`
          : ""
      }`,
    );

    if (!result) {
      throw new ErrorException("An assertion failed.");
    }
    return [];
  },
});
