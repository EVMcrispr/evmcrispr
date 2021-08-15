import { utils } from "ethers";
import { Address, ipfsResolver, IpfsResolver } from "@1hive/connect-core";
import { GraphQLWrapper, QueryResult } from "@1hive/connect-thegraph";
import {
  getAppArtifact,
  getSystemAppNameByAppId,
  getSystemAppArtifactByAppId,
  ORGANIZATION_APPS,
  REPO,
} from "./helpers";
import { ErrorException, ErrorNotFound } from "./errors";
import { App, PermissionMap, Repo } from "./types";

const buildAppRoles = (artifact: any, appCurrentRoles: any[]): PermissionMap => {
  const appRoles = artifact.roles.reduce((roleMap: PermissionMap, role: any) => {
    roleMap.set(role.bytes, { manager: null, grantees: new Set() });
    return roleMap;
  }, new Map());

  appCurrentRoles.forEach((role) => {
    if (appRoles.has(role.roleHash)) {
      appRoles.set(role.roleHash, {
        ...appRoles.get(role.roleHash),
        manager: role.manager,
        grantees: new Set(role.grantees.map(({ granteeAddress }: { granteeAddress: Address }) => granteeAddress)),
      });
    }
  });

  return appRoles;
};

const parseApp = async (app: any, ipfsResolver: IpfsResolver): Promise<App | undefined> => {
  const { repoName, appId, address } = app;
  const { address: codeAddress } = app.implementation;
  const { artifact: artifactJson, contentUri } = app.repo?.lastVersion || {};
  // Sometimes system apps dont't have the repo name set so we use the appId to get it.
  const name = repoName ?? getSystemAppNameByAppId(appId);

  if (!name && !contentUri) {
    return;
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
    // @ts-ignore ABI interface is set later when building the app cache
    abiInterface: null,
    permissions,
  };
};

function subgraphUrlFromChainId(chainId: number): string | null {
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
    const subgraphUrl = subgraphUrlFromChainId(chainId);

    if (!subgraphUrl) {
      throw new ErrorException("Connector requires a valid chain id to be passed (1, 4 or 100)");
    }

    this.#gql = new GraphQLWrapper(subgraphUrl);
    this.#ipfsResolver = ipfsResolver(ipfsUrlTemplate);
  }

  async disconnect(): Promise<void> {
    this.#gql.close();
  }

  async repo(repoName: string, registryName: string): Promise<Repo> {
    return this.#gql.performQueryWithParser(REPO("query"), { repoName }, async (result: QueryResult) => {
      // Cant filter by registry when fetching repos so we need to do it here
      const repo = result.data.repos.filter(({ registry }: { registry: any }) => registry.name === registryName).pop();

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
