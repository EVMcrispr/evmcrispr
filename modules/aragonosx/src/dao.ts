import type { Address } from "@evmcrispr/sdk";
import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getAddress, isAddress, isAddressEqual } from "viem";
import { normalize } from "viem/ens";
import type AragonOSx from ".";
import { getDeployment } from "./addresses";
import { fetchDaoPluginsOnchain } from "./onchain";
import { fetchDaoAddressBySubdomain, fetchDaoFromSubgraph } from "./subgraph";
import type { DaoContext, PluginInfo, RawPlugin } from "./types";

/** A plugin repo subdomain (e.g. `token-voting`). */
const PLUGIN_IDENTIFIER_REGEX = /^((?!-)[a-z0-9-]+(?<!-))$/;

export function isPluginSubdomain(identifier: string): boolean {
  return PLUGIN_IDENTIFIER_REGEX.test(identifier);
}

/** Display name of a plugin: its repo subdomain, or its address for unknown repos. */
export function pluginDisplayName(plugin: PluginInfo): string {
  return plugin.repoSubdomain ?? plugin.address.toLowerCase();
}

/** Number of installed plugins from the given repo subdomain. */
export function countPlugins(dao: DaoContext, subdomain: string): number {
  return dao.plugins.filter((p) => p.repoSubdomain === subdomain).length;
}

/** Find a plugin by repo subdomain (and instance index) or address. */
export function resolvePluginInfo(
  dao: DaoContext,
  identifierOrAddress: string,
  index = 0,
): PluginInfo | undefined {
  if (isAddress(identifierOrAddress)) {
    return dao.plugins.find((p) =>
      isAddressEqual(p.address, identifierOrAddress as Address),
    );
  }
  if (!isPluginSubdomain(identifierOrAddress)) return undefined;
  return dao.plugins.filter((p) => p.repoSubdomain === identifierOrAddress)[
    index
  ];
}

/** Resolve a DAO name to its address: subgraph subdomain lookup, then ENS. */
export async function resolveDaoAddress(
  module: AragonOSx,
  name: string,
): Promise<Address> {
  const deployment = await getDeployment(module);
  const client = await module.getClient();

  if (deployment.subgraphUrl) {
    try {
      const address = await fetchDaoAddressBySubdomain(
        deployment.subgraphUrl,
        name,
      );
      if (address) return address;
    } catch {
      // fall through to ENS
    }
  }

  try {
    const address = await client.getEnsAddress({
      name: normalize(`${name}.${deployment.daoEnsDomain}`),
    });
    if (address) return getAddress(address);
  } catch {
    // no ENS on this chain
  }

  throw new ErrorNotFound(
    `DAO "${name}" couldn't be resolved; pass the DAO address instead`,
  );
}

/** Load a DAO and its installed plugins: subgraph first, on-chain fallback. */
export async function loadDao(
  module: AragonOSx,
  daoAddressOrName: string,
): Promise<DaoContext> {
  const deployment = await getDeployment(module);
  const client = (await module.getClient()) as PublicClient;
  const chainId = await module.getChainId();

  let daoAddress: Address;
  let subdomain: string | undefined;
  if (isAddress(daoAddressOrName)) {
    daoAddress = getAddress(daoAddressOrName);
  } else {
    daoAddress = await resolveDaoAddress(module, daoAddressOrName);
    subdomain = daoAddressOrName;
  }

  const cached = module.getCachedDao(chainId, daoAddress);
  if (cached) {
    return cached;
  }

  let rawPlugins: RawPlugin[] | undefined;
  let subgraphError: Error | undefined;

  if (deployment.subgraphUrl) {
    try {
      const dao = await fetchDaoFromSubgraph(
        deployment.subgraphUrl,
        daoAddress,
      );
      if (dao) {
        rawPlugins = dao.plugins;
        subdomain = subdomain ?? dao.subdomain;
      }
    } catch (err) {
      subgraphError = err as Error;
    }
  }

  if (!rawPlugins) {
    try {
      rawPlugins = await fetchDaoPluginsOnchain(client, deployment, daoAddress);
    } catch (err) {
      throw new ErrorException(
        `couldn't load DAO ${daoAddress}: ${(err as Error).message}${
          subgraphError ? ` (subgraph error: ${subgraphError.message})` : ""
        }`,
      );
    }
  }

  const dao: DaoContext = {
    address: daoAddress,
    subdomain,
    plugins: rawPlugins.map((plugin) => ({ ...plugin })),
  };

  module.setCachedDao(chainId, daoAddress, dao);

  return dao;
}
