import type { PublicClient } from "viem";

import { ComparisonType, checkArgsLength } from "../../../utils";
import type { AragonOS } from "../AragonOS";
import type { Address, HelperFunction, Nullable } from "../../../types";
import { getAragonEnsResolver, resolveName } from "../utils";
import { ErrorException } from "../../../errors";

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

export const aragonEns: HelperFunction<AragonOS> = async (
  module,
  h,
  { interpretNodes },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Between,
    minValue: 1,
    maxValue: 2,
  });

  const [ensName] = await interpretNodes(h.args);

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
};
