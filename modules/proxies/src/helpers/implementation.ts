import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import {
  coreCall,
  encodeChain,
  encodeOrElse,
  rawParam,
  staticCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, getAddress, parseAbi } from "viem";
import type Proxies from "..";
import {
  BEACON_SLOT,
  beaconAbi,
  IMPLEMENTATION_SLOT,
  readSlotAddress,
} from "../utils";

export default defineHelper<Proxies>({
  name: "implementation",
  batchable: false,
  description:
    "Implementation address of an ERC-1967 proxy, following the beacon when the proxy is a beacon proxy.",
  compileDescription:
    "Resolves through an `implementation()` call or the beacon hop, so a slot-only proxy has no on-chain form and reverts.",
  returnType: "address",
  args: [{ name: "proxy", type: "address", description: "Proxy address" }],
  async run(module, { proxy }, { node }) {
    const client = await module.getClient();

    const implementation = await readSlotAddress(
      client,
      proxy,
      IMPLEMENTATION_SLOT,
    );
    if (implementation) return implementation;

    const beacon = await readSlotAddress(client, proxy, BEACON_SLOT);
    if (beacon) {
      return client.readContract({
        address: beacon,
        abi: beaconAbi,
        functionName: "implementation",
      });
    }

    throw new HelperFunctionError(
      node,
      `${proxy} is not an ERC-1967 proxy (its implementation and beacon slots are empty)`,
    );
  },
  compile: async (ctx, node) => {
    const proxy = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    const implementationData = encodeFunctionData({
      abi: beaconAbi,
      functionName: "implementation",
    });
    const beaconData = encodeFunctionData({
      abi: parseAbi(["function beacon() view returns (address)"]),
      functionName: "beacon",
    });
    // orElse: a call-exposed implementation() wins; otherwise hop
    // through the beacon. ERC-1967 slot-only proxies revert on both
    // branches — those reads stay off-chain (the plain face).
    return coreCall(
      ctx,
      encodeOrElse(
        staticCallParam(proxy, implementationData),
        staticCallParam(
          ctx.core,
          encodeChain(rawParam(toWord(BigInt(proxy))), [
            beaconData,
            implementationData,
          ]),
        ),
      ),
      "Address",
    );
  },
});
