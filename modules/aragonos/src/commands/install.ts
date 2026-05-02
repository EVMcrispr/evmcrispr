import type { Address, BindingsManager } from "@evmcrispr/sdk";
import {
  abiBindingKey,
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  encodeCalldata,
  fetchAbi,
  getOptValue,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getAbiItem, hexToString, namehash } from "viem";
import type AragonOS from "..";
import { type DaoContext, getKernel } from "../dao";
import { _aragonEns } from "../helpers/aragonEns";
import type { App, AppResource } from "../types";
import {
  buildAppPermissions,
  buildAppResource,
  parseLabeledAppIdentifier,
  REPO_ABI,
  SEMANTIC_VERSION_REGEX,
} from "../utils";
import { DAO_OPT_NAME, getModuleDAOByOption } from "../utils/commands";

const { ABI } = BindingsSpace;

const fetchRepoData = async (
  appName: string,
  appRegistry: string,
  appVersion = "latest",
  client: PublicClient,
  customEnsResolver?: Address,
): Promise<{ codeAddress: Address; contentUri: string }> => {
  const repoENSName = `${appName}.${appRegistry}`;
  const repoAddr = await _aragonEns(repoENSName, client, customEnsResolver);

  if (!repoAddr) {
    throw new ErrorException(
      `ENS repo name ${repoENSName} couldn't be resolved`,
    );
  }

  const repo = REPO_ABI;
  let codeAddress, rawContentUri;

  if (appVersion && appVersion !== "latest") {
    if (!SEMANTIC_VERSION_REGEX.test(appVersion)) {
      throw new ErrorException(
        `invalid --version option. Expected a semantic version, but got ${appVersion}`,
      );
    }

    [, codeAddress, rawContentUri] = await client.readContract({
      address: repoAddr,
      abi: repo,
      functionName: "getBySemanticVersion",
      args: [appVersion.split(".").map(Number) as [number, number, number]],
    });
  } else {
    [, codeAddress, rawContentUri] = await client.readContract({
      address: repoAddr,
      abi: repo,
      functionName: "getLatest",
    });
  }

  return { codeAddress, contentUri: hexToString(rawContentUri) };
};

const setApp = (
  dao: DaoContext,
  app: App,
  resource: AppResource,
  bindingsManager: BindingsManager,
  chainId: number,
): void => {
  dao.appResourceCache.set(app.codeAddress, resource);
  dao.appCache.set(app.name, app);

  bindingsManager.setBinding(
    abiBindingKey(chainId, app.codeAddress),
    app.abi,
    ABI,
    false,
    undefined,
    true,
  );
  bindingsManager.setBinding(
    abiBindingKey(chainId, app.address),
    app.abi,
    ABI,
    false,
    undefined,
    true,
  );
};

export default defineCommand<AragonOS>({
  name: "install",
  description: "Install an Aragon app into the connected DAO.",
  args: [
    { name: "variable", type: "variable", description: "Variable name" },
    {
      name: "identifier",
      type: "repo",
      description: "App APM repository name",
    },
    {
      name: "params",
      type: "any",
      rest: true,
      description: "App initialization arguments",
    },
  ],
  opts: [
    {
      name: DAO_OPT_NAME,
      type: "any",
      description: "DAO address or name to install into",
    },
    {
      name: "version",
      type: "any",
      description: "Specific app version to install",
    },
  ],
  async run(
    module,
    { variable, identifier, params = [] },
    { node, interpreters },
  ) {
    const { interpretNode } = interpreters;

    const dao = await getModuleDAOByOption(node, module, interpretNode);

    const version = await getOptValue(node, "version", interpretNode);
    const [appName, registry] = parseLabeledAppIdentifier(identifier);

    if (dao.appCache.has(identifier)) {
      throw new ErrorException(`identifier ${identifier} is already in use.`);
    }

    const client = await module.getClient();
    const { codeAddress, contentUri } = await fetchRepoData(
      appName,
      registry,
      version ?? "latest",
      client,
      module.getConfigBinding("ensResolver"),
    );

    const daos = module.allDAOs;
    const selectedDAOResources = daos
      .filter((dao) => dao.appResourceCache.has(codeAddress))
      .map((dao) => dao.appResourceCache.get(codeAddress)!);
    let resource: AppResource;

    if (!selectedDAOResources.length) {
      const [, abi] = await fetchAbi(codeAddress, client);
      resource = buildAppResource(appName, registry, abi);
    } else {
      resource = selectedDAOResources[0];
    }

    const { abi, roles } = resource;
    const kernel = getKernel(dao);
    const initParams = params as any[];

    const fnFragment = getAbiItem({
      name: "initialize",
      abi,
    });

    if (!fnFragment || fnFragment.type !== "function") {
      throw new ErrorException(
        `initialize function not found in ${identifier}`,
      );
    }

    const encodedInitializeFunction = encodeCalldata(fnFragment, initParams);

    const appId = namehash(`${appName}.${registry}`);
    const proxyContractAddress = await module.registerNextProxyAddress(
      identifier,
      kernel.address,
    );

    module.bindingsManager.setBinding(
      variable,
      proxyContractAddress,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    const chainId = await module.getChainId();
    setApp(
      dao,
      {
        abi,
        address: proxyContractAddress,
        codeAddress,
        contentUri,
        name: identifier,
        permissions: buildAppPermissions(roles, []),
        registryName: registry,
      },
      resource,
      module.bindingsManager,
      chainId,
    );

    return [
      encodeAction(
        kernel.address,
        "newAppInstance(bytes32,address,bytes,bool)",
        [appId, codeAddress, encodedInitializeFunction, false],
      ),
    ];
  },
});
