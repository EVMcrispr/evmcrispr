import type { Address } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import type { RawPlugin } from "./types";

type QueryResult = {
  data: any;
  errors?: { message: string }[];
};

export async function querySubgraph<T>(
  subgraphUrl: string,
  query: string,
  variables: Record<string, any>,
): Promise<T> {
  const rawResponse = await fetch(subgraphUrl, {
    body: JSON.stringify({ query, variables }),
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evmcrispr.com",
      Referer: "https://evmcrispr.com/",
    },
    method: "POST",
  });

  const { data, errors } = (await rawResponse.json()) as QueryResult;

  if (errors?.length) {
    throw new ErrorException(
      `An error happened while querying subgraph: ${JSON.stringify(errors[0])}`,
    );
  }

  return data;
}

const DAO_QUERY = `
query DaoData($id: ID!) {
  dao(id: $id) {
    id
    subdomain
    plugins(where: { state: Installed }) {
      plugin { id }
      appliedPluginRepo { id subdomain }
      appliedVersion { build release { release } }
      appliedPreparation { pluginAddress helpers }
    }
  }
}`;

const DAO_BY_SUBDOMAIN_QUERY = `
query DaoBySubdomain($subdomain: String!) {
  daos(where: { subdomain: $subdomain }, first: 1) {
    id
  }
}`;

export interface SubgraphDao {
  subdomain?: string;
  plugins: RawPlugin[];
}

/** Fetch a DAO and its installed plugins. Returns null when unknown. */
export async function fetchDaoFromSubgraph(
  subgraphUrl: string,
  daoAddress: Address,
): Promise<SubgraphDao | null> {
  const data = await querySubgraph<any>(subgraphUrl, DAO_QUERY, {
    id: daoAddress.toLowerCase(),
  });

  if (!data?.dao) {
    return null;
  }

  const plugins: RawPlugin[] = (data.dao.plugins ?? [])
    .filter((p: any) => p.plugin?.id || p.appliedPreparation?.pluginAddress)
    .map((p: any) => ({
      address: getAddress(p.plugin?.id ?? p.appliedPreparation.pluginAddress),
      repoSubdomain: p.appliedPluginRepo?.subdomain ?? undefined,
      repoAddress: p.appliedPluginRepo?.id
        ? getAddress(p.appliedPluginRepo.id)
        : undefined,
      versionTag:
        p.appliedVersion?.release?.release !== undefined &&
        p.appliedVersion?.build !== undefined
          ? {
              release: Number(p.appliedVersion.release.release),
              build: Number(p.appliedVersion.build),
            }
          : undefined,
      helpers: (p.appliedPreparation?.helpers ?? []).map((h: string) =>
        getAddress(h),
      ),
    }));

  return { subdomain: data.dao.subdomain ?? undefined, plugins };
}

/** Resolve a DAO address from its registered ENS subdomain. */
export async function fetchDaoAddressBySubdomain(
  subgraphUrl: string,
  subdomain: string,
): Promise<Address | null> {
  const data = await querySubgraph<any>(subgraphUrl, DAO_BY_SUBDOMAIN_QUERY, {
    subdomain,
  });
  const id = data?.daos?.[0]?.id;
  return id ? getAddress(id) : null;
}
