import { ErrorNotFound, ipfsResolver, IpfsResolver } from "@1hive/connect-core";
import { GraphQLWrapper, QueryResult } from "@1hive/connect-thegraph";
import { getAppArtifact, getSystemAppArtifact, ORGANIZATION_APPS, REPO } from "./helpers";
import { App, Repo } from "./types";

const buildAppRoles = (artifact: any, appCurrentRoles: any[]) => {
  const appRoles = artifact.roles.reduce((roleMap, role) => {
    roleMap.set(role.bytes, { manager: null, grantees: new Set() });
    return roleMap;
  }, new Map());

  appCurrentRoles.forEach((role) => {
    if (appRoles.has(role.roleHash)) {
      appRoles.set(role.roleHash, {
        ...appRoles.get(role.roleHash),
        manager: role.manager,
        grantees: new Set(role.grantees.map(({ granteeAddress }) => granteeAddress)),
      });
    }
  });

  return appRoles;
};

const parseApp = async (app: any, ipfsResolver: IpfsResolver): Promise<App> => {
  const { repoName: name } = app;
  const { address: codeAddress } = app.implementation;
  const { artifact: artifactJson, contentUri } = app.repo?.lastVersion || {};
  const artifact =
    getSystemAppArtifact(name) ?? JSON.parse(artifactJson) ?? (await getAppArtifact(ipfsResolver, contentUri));

  if (!artifact) {
    throw new ErrorNotFound(`App ${name} artifact not found`);
  }

  const permissions = buildAppRoles(artifact, app.roles);

  return {
    name,
    address: app.address,
    codeAddress,
    contentUri,
    abi: artifact.abi,
    permissions,
  };
};

function subgraphUrlFromChainId(chainId: number) {
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

export default class Connector {
  #ipfsResolver: IpfsResolver;
  #gql: GraphQLWrapper;

  constructor(chainId: number, ipfsUrlTemplate: string) {
    this.#gql = new GraphQLWrapper(subgraphUrlFromChainId(chainId));
    this.#ipfsResolver = ipfsResolver(ipfsUrlTemplate);
  }

  async disconnect(): Promise<void> {
    this.#gql.close();
  }

  async repo(repoName: string, registryName: string): Promise<Repo> {
    return this.#gql.performQueryWithParser(REPO("query"), { repoName }, async (result: QueryResult) => {
      // Cant filter by registry when fetching repos so we need to do it here
      const repo = result.data.repos.filter(({ registry }) => registry.name === registryName).pop();

      if (!repo) {
        throw new ErrorNotFound(`Repo ${repoName} not found`);
      }

      const { artifact: artifactJson, contentUri, codeAddress } = repo.lastVersion;
      const artifact = JSON.parse(artifactJson) ?? (await getAppArtifact(this.#ipfsResolver, contentUri));

      return {
        artifact,
        contentUri,
        codeAddress,
      };
    });
  }

  async organizationApps(daoAddress: string): Promise<App[]> {
    return this.#gql.performQueryWithParser(
      ORGANIZATION_APPS("query"),
      { id: daoAddress.toLowerCase() },
      async (result: QueryResult) => {
        const apps = result.data?.organization?.apps;

        if (!apps || result.data?.organization === null) {
          throw new ErrorNotFound(`Organization apps not found`);
        }

        const parseApps = Promise.all(
          apps.map(async (app: any) => {
            return parseApp(app, this.#ipfsResolver);
          })
        );
        return parseApps;
      }
    );
  }
}
