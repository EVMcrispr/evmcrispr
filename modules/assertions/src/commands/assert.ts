import type {
  Action,
  CallExpressionNode,
  DestructureSlot,
  Node,
  Param,
} from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeCalldata,
  NodeType,
  Num,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { isAddress, parseAbiItem } from "viem";
import type Assertions from "..";
import {
  encodeAssertion,
  loadFunctionAbi,
  operatorFragment,
} from "../lib/assertions";

/** Assertion value categories, keyed by the contract function name suffix. */
type Category = "Uint" | "Address" | "Bool" | "Bytes32" | "String";

const SOLIDITY_TYPE: Record<Category, string> = {
  Uint: "uint256",
  Address: "address",
  Bool: "bool",
  Bytes32: "bytes32",
  String: "string",
};

/** Operators each category supports for a plain (non-indexed) return. */
const PLAIN_OPERATORS: Record<Category, string[]> = {
  Uint: ["Eq", "Ne", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Address: ["Eq", "Ne"],
  Bool: ["Eq", "Ne"],
  Bytes32: ["Eq", "Ne"],
  String: [],
};

/** Operators each category supports when indexing into a tuple return. */
const INDEXED_OPERATORS: Record<Category, string[]> = {
  Uint: ["Eq", "Gt", "Lt", "Ge", "Le", "ApproxEq"],
  Address: ["Eq"],
  Bool: ["Eq"],
  Bytes32: ["Eq"],
  String: ["Eq"],
};

function categoryFromAbiType(abiType: string): Category {
  if (abiType.startsWith("uint") || abiType.startsWith("int")) return "Uint";
  if (abiType === "address") return "Address";
  if (abiType === "bool") return "Bool";
  if (abiType === "bytes32") return "Bytes32";
  if (abiType === "string") return "String";
  throw new ErrorException(
    `unsupported return type "${abiType}" for an assertion. Supported: uint*/int*, address, bool, bytes32, string`,
  );
}

/** Index of the single top-level `$` capture in a return-destructure lens. */
function tupleIndexFromLens(slots: DestructureSlot[]): number {
  let index = -1;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === "$") {
      if (index !== -1) {
        throw new ErrorException(
          "an assertion lens must contain exactly one $ to select the return value",
        );
      }
      index = i;
    } else if (Array.isArray(slot)) {
      throw new ErrorException(
        "nested destructuring is not supported in assertions; use a single top-level $ to select a return value",
      );
    }
  }
  if (index === -1) {
    throw new ErrorException(
      "an assertion lens must contain a $ to select the return value",
    );
  }
  return index;
}

export default defineCommand<Assertions>({
  name: "assert",
  description:
    "Assert that a contract view return satisfies a comparison, on-chain.",
  args: [
    {
      name: "call",
      type: "expression",
      description:
        "A `::` call expression, e.g. `@token(WETH)::balanceOf(@me)`",
    },
    {
      name: "operator",
      type: "string",
      optional: true,
      description: "Comparison operator: ==, !=, >, <, >=, <=, ~=",
    },
    {
      name: "expected",
      type: "any",
      optional: true,
      description: "Expected value the return is compared against",
    },
    {
      name: "message",
      type: "string",
      optional: true,
      description: "Revert message when the assertion fails",
    },
  ],
  opts: [
    {
      name: "delta",
      type: "number",
      description: "Allowed delta for the ~= (approximate) operator",
    },
  ],
  async run(
    module,
    { call, operator, expected, message },
    { opts, interpreters },
  ): Promise<Action[]> {
    const node = call as Node;
    if (node.type !== NodeType.CallExpression) {
      throw new ErrorException(
        "assert expects a call expression as its first argument, e.g. `assert @token(WETH)::balanceOf(@me) >= @token:amount(WETH 10)`",
      );
    }
    const n = node as CallExpressionNode;

    const [target, ...callArgs] = await interpreters.interpretNodes([
      n.target,
      ...n.args,
    ]);
    if (!isAddress(target)) {
      throw new ErrorException(
        `assertion target must resolve to an address, got ${target}`,
      );
    }

    let fnAbi: AbiFunction;
    if (n.inputTypes && n.outputTypes) {
      const sig = `function ${n.method}${n.inputTypes} view returns ${n.outputTypes}`;
      fnAbi = parseAbiItem(sig) as AbiFunction;
    } else {
      fnAbi = await loadFunctionAbi(module, target, n.method);
    }

    if (!fnAbi.outputs || fnAbi.outputs.length === 0) {
      throw new ErrorException(`${n.method} has no return value to assert on`);
    }

    const callData = encodeCalldata(fnAbi, callArgs as Param[]);

    let index: number | undefined;
    let outputType: string;
    if (n.returnDestructure) {
      index = tupleIndexFromLens(n.returnDestructure);
      const output = fnAbi.outputs[index];
      if (!output) {
        throw new ErrorException(
          `return index ${index} is out of range (${n.method} returns ${fnAbi.outputs.length} value(s))`,
        );
      }
      outputType = output.type;
    } else {
      if (fnAbi.outputs.length > 1) {
        throw new ErrorException(
          `${n.method} returns multiple values; use a destructure lens to select one, e.g. \`${n.method}(...)[_ $ _]\``,
        );
      }
      outputType = fnAbi.outputs[0].type;
    }

    const category = categoryFromAbiType(outputType);
    const indexed = index !== undefined;

    // Bare boolean assertion (no operator): assert the return is true.
    if (operator === undefined) {
      if (category !== "Bool" || indexed) {
        throw new ErrorException(
          "assert requires an operator and expected value, e.g. `assert <call> >= <value>`",
        );
      }
      const params: Param[] = [target, callData, message ?? ""];
      return [
        await encodeAssertion(
          module,
          "assertTrue(address,bytes,string)",
          params,
        ),
      ];
    }

    const allowed = indexed
      ? INDEXED_OPERATORS[category]
      : PLAIN_OPERATORS[category];
    const fragment = operatorFragment(operator, allowed);

    if (expected === undefined) {
      throw new ErrorException(
        `operator "${operator}" requires an expected value`,
      );
    }

    const isApprox = fragment === "ApproxEq";
    let delta: Num | undefined;
    if (isApprox) {
      if (opts.delta === undefined) {
        throw new ErrorException("the ~= operator requires a --delta value");
      }
      delta = opts.delta;
    }

    const fnName = `assert${fragment}Call${category}${indexed ? "N" : ""}`;

    const sigParams: string[] = ["address", "bytes"];
    if (indexed) sigParams.push("uint256");
    sigParams.push(SOLIDITY_TYPE[category]);
    if (isApprox) sigParams.push("uint256");
    sigParams.push("string");
    const signature = `${fnName}(${sigParams.join(",")})`;

    const params: Param[] = [target, callData];
    if (indexed) params.push(Num.fromBigInt(BigInt(index!)));
    params.push(expected as Param);
    if (isApprox && delta) params.push(delta);
    params.push(message ?? "");

    return [await encodeAssertion(module, signature, params)];
  },
});
