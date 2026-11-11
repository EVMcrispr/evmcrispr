import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import {
  coreCall,
  encodeChain,
  encodeOrElse,
  rawParam,
  readTarget,
  staticCallParam,
  targetCallParam,
  toWord,
} from "@evmcrispr/sdk/onchain";
import { type Address, encodeFunctionData, parseAbi } from "viem";
import type Proxies from "..";
import {
  BEACON_SLOT,
  beaconAbi,
  IMPLEMENTATION_SLOT,
  proxyAdminAbi,
  readSlotAddress,
  reportingAdmin,
} from "../utils";

export default defineHelper<Proxies>({
  name: "implementation",
  batchable: false,
  description:
    "Implementation address of an ERC-1967 proxy, following the beacon when the proxy is a beacon proxy.",
  compileDescription:
    "Resolves through the proxy's ProxyAdmin when one reports it, else an `implementation()` call or the beacon hop, so a slot-only proxy with no such admin reverts.",
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
    const proxy = await readTarget(ctx, "implementation!", node.args[0]);
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
    const exposed = encodeOrElse(
      targetCallParam(ctx, proxy, implementationData),
      staticCallParam(
        ctx.core,
        // The chain starts at the proxy: its address, fixed or live.
        encodeChain(
          typeof proxy === "string" ? rawParam(toWord(BigInt(proxy))) : proxy,
          [beaconData, implementationData],
        ),
      ),
    );
    // A transparent proxy shows implementation() only to its admin. When
    // that admin is a ProxyAdmin that reports it (read while the script
    // builds, for a fixed proxy), it is asked first: it asks the proxy as
    // the admin, at assertion time. A proxy handed to another admin since
    // makes it revert, and the reads above are tried instead.
    const admin =
      typeof proxy === "string"
        ? await ctx.module
            .getClient()
            .then((client) => reportingAdmin(client, proxy as Address))
            .catch(() => undefined)
        : undefined;
    if (!admin) return coreCall(ctx, exposed, "Address");
    return coreCall(
      ctx,
      encodeOrElse(
        staticCallParam(
          admin,
          encodeFunctionData({
            abi: proxyAdminAbi,
            functionName: "getProxyImplementation",
            args: [proxy as Address],
          }),
        ),
        staticCallParam(ctx.core, exposed),
      ),
      "Address",
    );
  },
});
