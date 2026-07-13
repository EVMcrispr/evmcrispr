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

/** `[_dao:]subdomain[:index]` — `_mydao:token-voting:1` targets another connected DAO. */
const PLUGIN_IDENTIFIER_REGEX =
  /^(?:_([a-zA-Z0-9.-]+|0x[0-9a-fA-F]{40}):)?((?!-)[a-z0-9-]+(?<!-))(?::(\d+))?$/;

export function parsePluginIdentifier(
  identifier: string,
): { daoPrefix?: string; subdomain: string; index: number } | undefined {
  const match = PLUGIN_IDENTIFIER_REGEX.exec(identifier);
  if (!match) return undefined;
  const [, daoPrefix, subdomain, index] = match;
  return { daoPrefix, subdomain, index: index ? Number(index) : 0 };
}

/** Assign `subdomain[:n]` identifiers, numbering repeated installs. */
export function buildPluginInfos(rawPlugins: RawPlugin[]): PluginInfo[] {
  const counters = new Map<string, number>();
  return rawPlugins.map((plugin) => {
    if (!plugin.repoSubdomain) {
      return { ...plugin, identifier: plugin.address.toLowerCase() };
    }
    const count = counters.get(plugin.repoSubdomain) ?? 0;
    counters.set(plugin.repoSubdomain, count + 1);
    const identifier =
      count === 0 ? plugin.repoSubdomain : `${plugin.repoSubdomain}:${count}`;
    return { ...plugin, identifier };
  });
}

/** Find a plugin by identifier (without DAO prefix) or address. */
export function resolvePluginInfo(
  dao: DaoContext,
  identifierOrAddress: string,
): PluginInfo | undefined {
  if (isAddress(identifierOrAddress)) {
    return dao.plugins.find((p) =>
      isAddressEqual(p.address, identifierOrAddress as Address),
    );
  }
  const parsed = parsePluginIdentifier(identifierOrAddress);
  if (!parsed) return undefined;
  return dao.plugins.find(
    (p) =>
      p.repoSubdomain === parsed.subdomain &&
      p.identifier ===
        (parsed.index === 0
          ? parsed.subdomain
          : `${parsed.subdomain}:${parsed.index}`),
  );
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
  nestingIndex: number,
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
    return { ...cached, nestingIndex };
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
    plugins: buildPluginInfos(rawPlugins),
    nestingIndex,
  };

  module.setCachedDao(chainId, daoAddress, dao);

  return dao;
}
