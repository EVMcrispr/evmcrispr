import {
  defineHelper,
  fetchAbi,
  findAbiFunctionBySelector,
  HelperFunctionError,
  lookupFunctionSignature,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import {
  decodeFunctionData,
  getAddress,
  parseAbiItem,
  toFunctionSignature,
} from "viem";
import type Std from "..";
import { makeEnsResolver, renderAbiValue } from "../utils/renderEvmlValue";

export default defineHelper<Std>({
  name: "abi.decodeCall",
  description:
    "Decode calldata into `[contract signature [args]]` with human-readable EVML values.",
  returnType: "array",
  args: [
    {
      name: "contract",
      type: "address",
      description: "Contract the calldata targets (its verified ABI is used)",
    },
    {
      name: "calldata",
      type: "bytes",
      description: "Full calldata including the 4-byte function selector",
    },
  ],
  async run(module, { contract, calldata }, { node }) {
    const target = getAddress(contract);
    if (calldata.length < 10) {
      throw new HelperFunctionError(
        node,
        "calldata is too short to contain a function selector",
      );
    }
    const selector = calldata.slice(0, 10);

    // Primary source: the contract's verified ABI (proxy-aware).
    let fnAbi: AbiFunction | undefined;
    try {
      const [, abi] = await fetchAbi(target, await module.getClient());
      fnAbi = findAbiFunctionBySelector(abi, selector);
    } catch {
      // Unverified contract or ABI service failure — fall through.
    }

    // Fallback: openchain.xyz signature database.
    if (!fnAbi) {
      const signature = await lookupFunctionSignature(selector);
      if (signature) {
        try {
          fnAbi = parseAbiItem(`function ${signature}`) as AbiFunction;
        } catch {
          fnAbi = undefined;
        }
      }
    }

    if (!fnAbi) {
      throw new HelperFunctionError(
        node,
        `could not resolve selector ${selector} for ${target}`,
      );
    }

    let args: readonly unknown[];
    try {
      ({ args = [] } = decodeFunctionData({ abi: [fnAbi], data: calldata }));
    } catch (err) {
      throw new HelperFunctionError(
        node,
        `failed to decode calldata: ${(err as Error).message}`,
      );
    }

    const resolveEns = makeEnsResolver(module);
    const rendered = await Promise.all(
      fnAbi.inputs.map((param, i) =>
        renderAbiValue(param, args[i], resolveEns),
      ),
    );

    return [target, toFunctionSignature(fnAbi), rendered];
  },
});
