import type {
  Abi,
  Address,
  Module,
  Param,
  TransactionAction,
} from "@evmcrispr/sdk";
import {
  abiBindingKey,
  BindingsSpace,
  ErrorException,
  encodeAction,
  fetchAbi,
  resolveName,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { createPublicClient, getAbiItem, getAddress, isAddress } from "viem";
import { mainnet } from "viem/chains";

/** ENS name the assertions contract is published under (Ethereum mainnet). */
const ASSERTIONS_ENS = "assertions.eth";

/** User binding to override the resolved contract address (testing / forks). */
const ADDRESS_BINDING = "$assertions.address";

/**
 * Resolve the assertions contract address. Honours the `$assertions.address`
 * override when set, otherwise forward-resolves `assertions.eth` on mainnet.
 */
export async function resolveAssertionsContract(
  module: Module,
): Promise<Address> {
  const override = module.bindingsManager.getBindingValue(
    ADDRESS_BINDING,
    BindingsSpace.USER,
  );
  if (override !== undefined && override !== null) {
    const addr = String(override);
    if (!isAddress(addr)) {
      throw new ErrorException(
        `${ADDRESS_BINDING} must be a valid address, got ${addr}`,
      );
    }
    return getAddress(addr);
  }

  const client = createPublicClient({
    chain: mainnet,
    transport: module.getTransport(mainnet.id),
  });
  const addr = await resolveName(ASSERTIONS_ENS, client);
  if (!addr) {
    throw new ErrorException(`could not resolve ${ASSERTIONS_ENS}`);
  }
  return addr;
}

/**
 * Encode a call to the assertions contract and flag it `readOnly` so it runs as
 * a `eth_call` check when executed standalone, but as a real atomic call when
 * included in a batch.
 */
export async function encodeAssertion(
  module: Module,
  signature: string,
  params: Param[],
): Promise<TransactionAction> {
  const target = await resolveAssertionsContract(module);
  return { ...encodeAction(target, signature, params), readOnly: true };
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
