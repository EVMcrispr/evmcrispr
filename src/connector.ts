import { ipfsResolver, IpfsResolver } from "@1hive/connect-core";
import { GraphQLWrapper, QueryResult } from "@1hive/connect-thegraph";
import {
  getAppArtifact,
  getSystemAppNameByAppId,
  getSystemAppArtifactByAppId,
  ORGANIZATION_APPS,
  REPO,
} from "./helpers";
import { ErrorNotFound } from "./errors";
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
  const { repoName, appId, address } = app;
  const { address: codeAddress } = app.implementation;
  const { artifact: artifactJson, contentUri } = app.repo?.lastVersion || {};
  // Sometimes system apps dont't have the repo name set so we use the appId to get it.
  const name = repoName ?? getSystemAppNameByAppId(appId);

  if (!name && !contentUri) {
    return null; // Promise.reject()
  }

  const artifact =
    getSystemAppArtifactByAppId(appId) ?? JSON.parse(artifactJson) ?? (await getAppArtifact(ipfsResolver, contentUri));

  if (!artifact) {
    throw new ErrorNotFound(`App ${name} artifact not found`);
  }

  const permissions = buildAppRoles(artifact, app.roles);

  return {
    name,
    address,
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
        throw new ErrorNotFound(`Repo ${repoName}.${registryName} not found`);
      }

      const { artifact: artifactJson, contentUri, codeAddress } = repo.lastVersion;
      const artifact = artifactJson ? JSON.parse(artifactJson) : await getAppArtifact(this.#ipfsResolver, contentUri);

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

        return Promise.all(apps.map((app: any) => parseApp(app, this.#ipfsResolver)));
      }
    );
  }
}
