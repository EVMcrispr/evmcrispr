import type { Abi, Address, BindingsManager } from "@evmcrispr/sdk";
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
import type { App } from "../types";
import {
  buildAppPermissions,
  buildAppResource,
  parseRepoIdentifier,
  REPO_ABI,
  SEMANTIC_VERSION_REGEX,
} from "../utils";
import { getModuleDAO } from "../utils/commands";

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
  bindingsManager: BindingsManager,
  chainId: number,
): void => {
  dao.apps.push(app);

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
      name: "version",
      type: "string",
      description: "Specific app version to install",
    },
  ],
  async run(
    module,
    { variable, identifier, params = [] },
    { node, interpreters },
  ) {
    const { interpretNode } = interpreters;

    const dao = getModuleDAO(module);

    const version = await getOptValue(node, "version", interpretNode);
    const [appName, registry] = parseRepoIdentifier(identifier);

    const client = await module.getClient();
    const { codeAddress, contentUri } = await fetchRepoData(
      appName,
      registry,
      version ?? "latest",
      client,
      module.getConfigBinding("ensResolver"),
    );

    const chainId = await module.getChainId();
    // ABIs are cached globally in the ABI bindings space, keyed by chain and address.
    const cachedAbi = module.bindingsManager.getBindingValue(
      abiBindingKey(chainId, codeAddress),
      ABI,
    ) as Abi | undefined;

    let abi: Abi;
    if (cachedAbi) {
      abi = cachedAbi;
    } else {
      [, abi] = await fetchAbi(codeAddress, client);
    }

    const { roles } = buildAppResource(appName, registry, abi);
    const kernel = getKernel(dao);
    const initParams = params as any[];

    const fnFragment = getAbiItem({
      name: "initialize",
      abi,
    });

    if (fnFragment?.type !== "function") {
      throw new ErrorException(
        `initialize function not found in ${identifier}`,
      );
    }

    const encodedInitializeFunction = encodeCalldata(fnFragment, initParams);

    const appId = namehash(`${appName}.${registry}`);
    const proxyContractAddress = await module.registerNextProxyAddress(
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

    setApp(
      dao,
      {
        abi,
        address: proxyContractAddress,
        codeAddress,
        contentUri,
        name: appName,
        permissions: buildAppPermissions(roles, []),
        registryName: registry,
      },
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
