import type { Abi, Address, Module, TransactionAction } from "@evmcrispr/sdk";
import {
  abiBindingKey,
  BindingsSpace,
  ErrorException,
  fetchAbi,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress, isAddress } from "viem";
import type { InputParam } from "./erc8211";
import { encodeAssertParam } from "./erc8211";

/** Canonical CREATE2 address of the Assertions core v2.0 on every chain. */
export const ASSERTIONS_ADDRESS: Address =
  "0xa55E47F37088b6D0212BdfD56b175ec08744DB19";

/** Canonical CREATE2 address of the Combinators v2.0 on every chain. */
export const COMBINATORS_ADDRESS: Address =
  "0xA55Ec0935FB5aaf95CAC1F48DD822005d91b64b9";

function resolveOverride(module: Module, key: string): Address | undefined {
  const override = module.getConfigBinding(key);
  if (override === undefined || override === null) return undefined;
  const addr = String(override);
  if (!isAddress(addr)) {
    throw new ErrorException(
      `$assertions:${key} must be a valid address, got ${addr}`,
    );
  }
  return getAddress(addr);
}

/**
 * Resolve the assertions contract address. Honours the `$assertions:address`
 * override when set, otherwise uses the canonical CREATE2 deployment, which
 * lives at the same address on every chain.
 */
export async function resolveAssertionsContract(
  module: Module,
): Promise<Address> {
  return resolveOverride(module, "address") ?? ASSERTIONS_ADDRESS;
}

/**
 * Resolve the combinators contract address. Honours the
 * `$assertions:combinators` override when set, otherwise uses the canonical
 * CREATE2 deployment.
 */
export async function resolveCombinatorsContract(
  module: Module,
): Promise<Address> {
  return resolveOverride(module, "combinators") ?? COMBINATORS_ADDRESS;
}

/**
 * Encode an `assertParam(param[, message])` action against the assertions
 * contract, flagged `readOnly` so it runs as an `eth_call` check when
 * executed standalone, but as a real atomic call when included in a batch.
 */
export async function assertParamAction(
  module: Module,
  param: InputParam,
  message = "",
): Promise<TransactionAction> {
  const target = await resolveAssertionsContract(module);
  return {
    to: target,
    data: encodeAssertParam(param, message),
    readOnly: true,
  };
}

/** Map a DSL comparison operator to its assertions-contract name fragment. */
const OPERATORS: Record<string, string> = {
  "==": "Eq",
  "!=": "Ne",
  ">": "Gt",
  "<": "Lt",
  ">=": "Ge",
  "<=": "Le",
  "~=": "ApproxEq",
};

/**
 * Translate an operator token into its contract name fragment (e.g. `>=` ->
 * `Ge`), validating it is one of `allowed`.
 */
export function operatorFragment(op: string, allowed: string[]): string {
  const fragment = OPERATORS[op];
  if (!fragment) {
    throw new ErrorException(
      `unknown comparison operator "${op}". Use one of ${Object.keys(
        OPERATORS,
      ).join(", ")}`,
    );
  }
  if (!allowed.includes(fragment)) {
    throw new ErrorException(
      `operator "${op}" is not supported here. Allowed operators: ${allowed
        .map((f) => operatorToken(f))
        .join(", ")}`,
    );
  }
  return fragment;
}

function operatorToken(fragment: string): string {
  const entry = Object.entries(OPERATORS).find(([, f]) => f === fragment);
  return entry ? entry[0] : fragment;
}

/** Load the ABI function fragment for `method` on `target`. */
export async function loadFunctionAbi(
  module: Module,
  target: Address,
  method: string,
): Promise<AbiFunction> {
  const chainId = await module.getChainId();
  let abi = module.bindingsManager.getBindingValue(
    abiBindingKey(chainId, target),
    BindingsSpace.ABI,
  ) as Abi | undefined;

  if (!abi) {
    const client = await module.getClient();
    const [, fetched] = await fetchAbi(target, client);
    abi = fetched;
  }

  const item = getAbiItem({ abi, name: method }) as AbiFunction | undefined;
  if (item?.type !== "function") {
    throw new ErrorException(
      `function "${method}" not found in ABI of ${target}`,
    );
  }
  return item;
}
