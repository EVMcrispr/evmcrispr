import {
  chainLabel,
  clientFor,
  defineHelper,
  ErrorException,
  resolveChainId,
} from "@evmcrispr/sdk";
import type Eez from "..";
import { eezBaseAbi } from "../abis";
import { eezConfigFor } from "../utils/eez";

export default defineHelper<Eez>({
  name: "target",
  batchable: false,
  description:
    "The remote contract a cross-chain proxy stands in for: the reverse of @eez:proxy. Fails if the address is not a registered proxy on that chain.",
  returnType: "address",
  args: [
    {
      name: "chain",
      type: "chain",
      description: "Chain the proxy lives on (`eezL1`, `eezL2`)",
    },
    {
      name: "proxy",
      type: "address",
      description: "Cross-chain proxy address on that chain",
    },
  ],
  async run(module, { chain, proxy }) {
    const chainId = resolveChainId(chain);
    const config = await eezConfigFor(module, chainId);
    const client = await clientFor(module, chainId);
    const [exists, originalAddress] = await client.readContract({
      address: config.registry,
      abi: eezBaseAbi,
      functionName: "authorizedProxies",
      args: [proxy],
    });
    if (!exists) {
      throw new ErrorException(
        `${proxy} is not a cross-chain proxy on ${chainLabel(chainId)}`,
      );
    }
    return originalAddress;
  },
});
