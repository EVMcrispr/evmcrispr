import type { Address, Nullable } from "@evmcrispr/sdk";
import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import type AragonOS from "..";
import { getAragonEnsResolver, resolveName } from "../utils";

export const _aragonEns = async (
  ensName: string,
  client: PublicClient,
  customENSResolver?: Nullable<Address>,
): Promise<`0x${string}` | null> => {
  const ensResolver =
    customENSResolver || getAragonEnsResolver(await client.getChainId());
  const name = await resolveName(ensName, client, ensResolver);

  return name;
};

export default defineHelper<AragonOS>({
  name: "aragonEns",
  batchable: false,
  description: "Resolve an Aragon ENS name to its address.",
  returnType: "address",
  args: [
    {
      name: "ensName",
      type: "string",
      description: "ENS name to resolve to an address",
    },
    {
      name: "extra",
      type: "any",
      description: "Additional ENS path segment",
      optional: true,
    },
  ],
  async run(module, { ensName }) {
    const customENSResolver = module.getConfigBinding("ensResolver");
    const name = await _aragonEns(
      ensName,
      await module.getClient(),
      customENSResolver,
    );

    if (!name) {
      throw new ErrorException(`ENS ${ensName} couldn't be resolved.`);
    }

    return name;
  },
});
