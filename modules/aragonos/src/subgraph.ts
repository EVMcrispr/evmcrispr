import type { Address } from "@evmcrispr/sdk";
import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import type { ParsedApp } from "./types";
import type { GraphQLBody } from "./utils";
import { ORGANIZATION_APPS, parseApp } from "./utils";

export function subgraphUrlFromChainId(chainId: number): string | never {
  switch (chainId) {
    case 1:
      return "https://gateway-arbitrum.network.thegraph.com/api/458055b0bdee8336f889084f8378d7fa/subgraphs/id/BjzJNAmbkpTN3422j5rh3Gv7aejkDfRH1QLyoJC3qTMZ";
    case 10:
      return "https://gateway-arbitrum.network.thegraph.com/api/458055b0bdee8336f889084f8378d7fa/subgraphs/id/GHtDCXqSdwYPgXSigMA21yRpAWDwiAxqsfYsEw7NLMPk";
    case 100:
      return "https://gateway-arbitrum.network.thegraph.com/api/458055b0bdee8336f889084f8378d7fa/subgraphs/id/4xcBUyAqw61JTtP4SwvTw8f7RgRA6A1bxENatnK9cF33";
    default:
      throw new ErrorException(`No subgraph found for chain id ${chainId}`);
  }
}

type QueryResult = {
  data: any;
  errors?: { message: string }[];
};

const getSubgraphUrl = (
  chainId: number,
  options: { subgraphUrl?: string } = {},
): string => options.subgraphUrl || subgraphUrlFromChainId(chainId);

export async function querySubgraph<T>(
  subgraphUrl: string,
  body: GraphQLBody,
  parser?: (data: any) => T | Promise<T>,
): Promise<T> {
  const rawResponse = await fetch(subgraphUrl, {
    body: JSON.stringify(body),
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

  return parser ? parser(data) : data;
}

/**
 * Fetch all the apps installed on a DAO.
 * @param client Public client used to resolve the chain subgraph and parse apps.
 * @param daoAddress The address of the DAO to fetch.
 * @returns A promise that resolves to a group of all the apps of the DAO.
 */
export async function organizationApps(
  client: PublicClient,
  daoAddress: Address,
  options: { subgraphUrl?: string } = {},
): Promise<ParsedApp[]> {
  return querySubgraph<ParsedApp[]>(
    getSubgraphUrl(await client.getChainId(), options),
    ORGANIZATION_APPS(daoAddress.toLowerCase()),
    (data: any) => {
      const apps = data?.organization?.apps;

      if (!apps || data?.organization === null) {
        throw new ErrorNotFound(`Organization apps not found`);
      }

      return Promise.all(apps.map((app: any) => parseApp(app, client)));
    },
  );
}
