import { GraphQLWrapper, QueryResult } from "@1hive/connect-thegraph";
import { ORGANIZATION_APPS, parseApp, parseRepo, REPO } from "./helpers";
import { ErrorException, ErrorNotFound } from "./errors";
import { Address, ParsedApp, Repo } from "./types";

export function subgraphUrlFromChainId(chainId: number): string | null {
  switch (chainId) {
    case 1:
      return "https://api.thegraph.com/subgraphs/name/aragon/aragon-mainnet";
    case 4:
      return "https://api.thegraph.com/subgraphs/name/1hive/aragon-rinkeby";
    case 100:
      return "https://api.thegraph.com/subgraphs/name/1hive/aragon-xdai";
    default:
      return null;
  }
}

/**
 * Connector that expose functionalities to fetch app data from subgraphs and IPFS.
 * @category Utility
 */
export default class Connector {
  protected _gql: GraphQLWrapper;

  /**
   * Create a new Connector instance.
   * @param chainId The network id to connect to.
   */
  constructor(chainId: number) {
    const subgraphUrl = subgraphUrlFromChainId(chainId);

    if (!subgraphUrl) {
      throw new ErrorException("Connector requires a valid chain id to be passed (1, 4 or 100)");
    }

    this._gql = new GraphQLWrapper(subgraphUrl);
  }

  /**
   * Close the connection.
   */
  async disconnect(): Promise<void> {
    this._gql.close();
  }

  /**
   * Fetch an app's APM repo.
   * @param repoName The name of the app that appears in the APM ENS. For example, if the app's ENS is `voting.aragonpm.eth`
   * the name would be `voting`.
   * @param registryName The name of the app's registry that appears in the APM ENS. For example: `open.aragonpm.eth`.
   * @returns A promise that resolves to the app's repo.
   */
  async repo(repoName: string, registryName: string): Promise<Repo> {
    return this._gql.performQueryWithParser(REPO("query"), { repoName }, (result: QueryResult) => {
      // Cant filter by registry when fetching repos so we need to do it here
      const repo = result.data.repos.filter(({ registry }: { registry: any }) => registry.name === registryName).pop();

      if (!repo) {
        throw new ErrorNotFound(`Repo ${repoName}.${registryName} not found`, { name: "ErrorRepoNotFound" });
      }

      return parseRepo(repo);
    });
  }

  /**
   * Fetch all the apps installed on a DAO.
   * @param daoAddress The address of the DAO to fetch.
   * @returns A promise that resolves to a group of all the apps of the DAO.
   */
  async organizationApps(daoAddress: Address): Promise<ParsedApp[]> {
    return this._gql.performQueryWithParser(
      ORGANIZATION_APPS("query"),
      { id: daoAddress.toLowerCase() },
      (result: QueryResult) => {
        const apps = result.data?.organization?.apps;

        if (!apps || result.data?.organization === null) {
          throw new ErrorNotFound(`Organization apps not found`);
        }

        return apps.map(parseApp);
      }
    );
  }
}
