import { GraphQLWrapper, Organization } from "@1hive/connect";
import { GET_APP_CONTENT_URI, GET_REPO_DATA } from "../subgraphs/queries";

export function subgraphUrlFromChainId(chainId: number) {
  switch (chainId) {
    case 1:
      return "https://api.thegraph.com/subgraphs/name/1hive/aragon-mainnet";
    case 4:
      return "https://api.thegraph.com/subgraphs/name/1hive/aragon-rinkeby";
    case 100:
      return "https://api.thegraph.com/subgraphs/name/1hive/aragon-xdai";
    default:
      return null;
  }
}

export const getAppRepoData = async (gql: GraphQLWrapper, repoName: string, registryName: string) => {
  const queryResult = await gql.performQuery(GET_REPO_DATA("query"), { repoName });

  // Cant filter by registry when fetching repos so we need to do it here
  return queryResult.data.repos.filter(({ registry }) => registry.name === registryName).pop();
};

export const getAppContentUri = async (gql: GraphQLWrapper, appAddress: string) => {
  const queryResult = await gql.performQuery(GET_APP_CONTENT_URI("query"), { appAddress });

  return queryResult.data.apps.pop();
};
