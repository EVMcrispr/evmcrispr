import { chainLabel, defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Eez from "..";
import { eezBaseAbi } from "../abis";
import { eezConfig } from "../utils/eez";

export default defineHelper<Eez>({
  name: "target",
  batchable: false,
  description:
    "The remote contract a cross-chain proxy on the current chain stands in for. Fails if the address is not a registered proxy.",
  returnType: "address",
  args: [
    {
      name: "proxy",
      type: "address",
      description: "Cross-chain proxy address on the current chain",
    },
  ],
  async run(module, { proxy }) {
    const config = await eezConfig(module);
    const client = await module.getClient();
    const [exists, originalAddress] = await client.readContract({
      address: config.registry,
      abi: eezBaseAbi,
      functionName: "authorizedProxies",
      args: [proxy],
    });
    if (!exists) {
      throw new ErrorException(
        `${proxy} is not a cross-chain proxy on ${chainLabel(config.chainId)}`,
      );
    }
    return originalAddress;
  },
});
