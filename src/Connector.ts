import { ipfsResolver, IpfsResolver } from "@1hive/connect-core";
import { GraphQLWrapper, QueryResult } from "@1hive/connect-thegraph";
import {
  getAppArtifact,
  getSystemAppNameByAppId,
  getSystemAppArtifactByAppId,
  ORGANIZATION_APPS,
  REPO,
} from "./helpers";
import { ErrorException, ErrorNotFound } from "./errors";
import { Address, App, PermissionMap, Repo } from "./types";

const buildAppRoles = (artifact: any, appCurrentRoles: any[]): PermissionMap => {
  const appRoles = artifact.roles.reduce((roleMap: PermissionMap, role: any) => {
    roleMap.set(role.bytes, { manager: "", grantees: new Set() });
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
  const { address, appId, implementation, repoName } = app;
  const { address: codeAddress } = implementation;
  const { registry, lastVersion } = app.repo || {};
  const { artifact: artifactJson, contentUri } = lastVersion || {};
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
    abi: artifact.abi,
    // eslint-disable-next-line
    // @ts-ignore ABI interface is set later when building the app cache
    abiInterface: null,
    address,
    codeAddress,
    contentUri,
    name,
    permissions,
    registryName: registry?.name,
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

/**
 * Connector that expose functionalities to fetch app data from subgraphs and IPFS.
 * @category Utility
 */
export default class Connector {
  #ipfsResolver: IpfsResolver;
  #gql: GraphQLWrapper;

  /**
   * Create a new Connector instance.
   * @param chainId The network id to connect to.
   * @param ipfsUrlTemplate An IPFS gateway [URL Template](https://en.wikipedia.org/wiki/URI_Template) containing the
   * `{cid}` and `{path}` parameters used to fetch app artifacts.
   */
  constructor(chainId: number, ipfsUrlTemplate: string) {
    const subgraphUrl = subgraphUrlFromChainId(chainId);

    if (!subgraphUrl) {
      throw new ErrorException("Connector requires a valid chain id to be passed (1, 4 or 100)");
    }

    this.#gql = new GraphQLWrapper(subgraphUrl);
    this.#ipfsResolver = ipfsResolver(ipfsUrlTemplate);
  }

  /**
   * Close the connection.
   */
  async disconnect(): Promise<void> {
    this.#gql.close();
  }

  /**
   * Fetch an app's APM repo.
   * @param repoName The name of the app that appears in the APM ENS. For example, if the app's ENS is `voting.aragonpm.eth`
   * the name would be `voting`.
   * @param registryName The name of the app's registry that appears in the APM ENS. For example: `open.aragonpm.eth`.
   * @returns A promise that resolves to the app's repo.
   */
  async repo(repoName: string, registryName: string): Promise<Repo> {
    return this.#gql.performQueryWithParser(REPO("query"), { repoName }, async (result: QueryResult) => {
      // Cant filter by registry when fetching repos so we need to do it here
      const repo = result.data.repos.filter(({ registry }: { registry: any }) => registry.name === registryName).pop();

      if (!repo) {
        throw new ErrorNotFound(`Repo ${repoName}.${registryName} not found`, { name: "ErrorRepoNotFound" });
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

  /**
   * Fetch all the apps installed on a DAO.
   * @param daoAddress The address of the DAO to fetch.
   * @returns A promise that resolves to a group of all the apps of the DAO.
   */
  async organizationApps(daoAddress: Address): Promise<App[]> {
    return this.#gql.performQueryWithParser(
      ORGANIZATION_APPS("query"),
      { id: daoAddress.toLowerCase() },
      async (result: QueryResult) => {
        const apps = result.data?.organization?.apps;

        if (!apps || result.data?.organization === null) {
          throw new ErrorNotFound(`Organization apps not found`);
        }

        const parsedApps = Promise.all(apps.map((app: any) => parseApp(app, this.#ipfsResolver)));

        return parsedApps;
      }
    );
  }
}
