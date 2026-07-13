import type { Address } from "@evmcrispr/sdk";
import { ErrorNotFound } from "@evmcrispr/sdk";
import { getAddress, isAddress } from "viem";
import { normalize } from "viem/ens";
import type AragonOSx from "..";
import { getDeployment, type KnownRepo } from "../addresses";

/**
 * Resolve a plugin repo reference: an address, one of the Aragon-maintained
 * repo subdomains, or an ENS lookup under the chain's plugin domain.
 */
export async function resolveRepoAddress(
  module: AragonOSx,
  repo: string,
): Promise<Address> {
  if (isAddress(repo)) return getAddress(repo);

  const deployment = await getDeployment(module);

  const known = deployment.repos?.[repo as KnownRepo];
  if (known) return known;

  try {
    const client = await module.getClient();
    const address = await client.getEnsAddress({
      name: normalize(`${repo}.${deployment.pluginEnsDomain}`),
    });
    if (address) return getAddress(address);
  } catch {
    // no ENS on this chain
  }

  throw new ErrorNotFound(
    `plugin repo "${repo}" couldn't be resolved; pass the PluginRepo address instead`,
  );
}
