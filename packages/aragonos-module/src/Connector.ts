import { ErrorException, ErrorNotFound } from '@1hive/evmcrispr';
import type { Address } from '@1hive/evmcrispr';
import type { providers } from 'ethers';
import fetch from 'isomorphic-fetch';

import type { ParsedApp, Repo } from './types';
import type { GraphQLBody, QueryConfig } from './utils';
import { ORGANIZATION_APPS, REPO, parseApp, parseRepo } from './utils';

export function subgraphUrlFromChainId(chainId: number): string | never {
  switch (chainId) {
    case 1:
      return 'https://api.thegraph.com/subgraphs/name/aragon/aragon-mainnet';
    case 4:
      return 'https://api.thegraph.com/subgraphs/name/1hive/aragon-rinkeby';
    case 5:
      return 'https://api.thegraph.com/subgraphs/name/aragon/aragon-goerli';
    case 100:
      return 'https://api.thegraph.com/subgraphs/name/1hive/aragon-xdai';
    case 137:
      return 'https://api.thegraph.com/subgraphs/name/1hive/aragon-polygon';
    default:
      throw new ErrorException(`No subgraph found for chain id ${chainId}`);
  }
}

type QueryResult = {
  data: any;
  errors?: { message: string }[];
};

/**
 * Connector that expose functionalities to fetch app data from subgraphs and IPFS.
 * @category Utility
 */
export class Connector {
  #subgraphUrl: string;
  #provider: providers.Provider;

  /**
   * Create a new Connector instance.
   * @param chainId The network id to connect to.
   * @param options The optional configuration object.
   */
  constructor(
    chainId: number,
    provider: providers.Provider,
    options: { subgraphUrl?: string } = {},
  ) {
    const subgraphUrl = options.subgraphUrl || subgraphUrlFromChainId(chainId);

    if (!subgraphUrl) {
      throw new ErrorException(
        `Network ${chainId} not supported. Use 1, 4 or 100.`,
      );
    }

    this.#subgraphUrl = subgraphUrl;
    this.#provider = provider;
  }

  protected async querySubgraph<T>(
    body: GraphQLBody,
    parser?: (data: any) => T | Promise<T>,
  ): Promise<T> {
    const rawResponse = await fetch(this.#subgraphUrl, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const { data, errors } = (await rawResponse.json()) as QueryResult;

    if (errors?.length) {
      throw new ErrorException(
        `An error happened while querying subgraph: ${errors[0]}`,
      );
    }

    return parser ? parser(data) : data;
  }

  /**
   * Fetch an app's APM repo.
   * @param repoName The name of the app that appears in the APM ENS. For example, if the app's ENS is `voting.aragonpm.eth`
   * the name would be `voting`.
   * @param registryName The name of the app's registry that appears in the APM ENS. For example: `open.aragonpm.eth`.
   * @returns A promise that resolves to the app's repo.
   */
  async repo(repoName: string, registryName: string): Promise<Repo> {
    return this.querySubgraph<Repo>(
      REPO(repoName, registryName),
      (data: any) => {
        const repo = data.repos.pop();

        if (!repo) {
          throw new ErrorNotFound(
            `Repo ${repoName}.${registryName} not found`,
            {
              name: 'ErrorRepoNotFound',
            },
          );
        }

        return parseRepo(repo);
      },
    );
  }

  /**
   * Fetch all the apps installed on a DAO.
   * @param daoAddress The address of the DAO to fetch.
   * @returns A promise that resolves to a group of all the apps of the DAO.
   */
  async organizationApps(daoAddress: Address): Promise<ParsedApp[]> {
    const chainId = (await this.#provider.getNetwork()).chainId;
    const queryConfig: QueryConfig = { isGoerliSubgraph: chainId === 5 };

    return this.querySubgraph<ParsedApp[]>(
      ORGANIZATION_APPS(daoAddress.toLowerCase(), queryConfig),
      (data: any) => {
        const apps = data?.organization?.apps;

        if (!apps || data?.organization === null) {
          throw new ErrorNotFound(`Organization apps not found`);
        }

        return Promise.all(
          apps.map((app: any) => parseApp(app, this.#provider)),
        );
      },
    );
  }
}
