import type { PublicClient } from "viem";
import { ErrorException } from "../../../errors";
import type { Address, Nullable } from "../../../types";
import { defineHelper } from "../../../utils";
import type { AragonOS } from "..";
import { getAragonEnsResolver, resolveName } from "../utils";

export const _aragonEns = async (
  ensName: string,
  client: PublicClient,
  customENSResolver?: Nullable<Address>,
): Promise<`0x${string}` | null> => {
  const ensResolver =
    customENSResolver || getAragonEnsResolver(await client.getChainId());
  const name = await resolveName(ensName, ensResolver, client);

  return name;
};

export default defineHelper<AragonOS>({
  name: "aragonEns",
  args: [
    { name: "ensName", type: "string" },
    { name: "extra", type: "any", optional: true },
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
