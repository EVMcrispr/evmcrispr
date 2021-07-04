import { ErrorNotFound, GraphQLWrapper, QueryResult } from "@1hive/connect";
import { GET_APP_ROLES, GET_REPO_DATA } from "../subgraphs/queries";

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

export const getAppRepoData = async (gql: GraphQLWrapper, repoName: string, registryName: string): Promise<any> => {
  return gql.performQueryWithParser(GET_REPO_DATA("query"), { repoName }, (result: QueryResult) => {
    // Cant filter by registry when fetching repos so we need to do it here
    const appRepo = result.data.repos.filter(({ registry }) => registry.name === registryName).pop();
    if (!appRepo) {
      throw new ErrorNotFound(`Repo ${repoName}.${registryName} not found`);
    }

    return appRepo;
  });
};

export const getAppRolesData = async (gql: GraphQLWrapper, appAddress: string): Promise<any> => {
  return gql.performQueryWithParser(GET_APP_ROLES("query"), { appAddress }, async (result: QueryResult) => {
    const { app } = result.data;

    if (!app) {
      throw new ErrorNotFound(`App with address ${appAddress} not found`);
    }

    return app.roles;
  });
};
