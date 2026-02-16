import type { Address, BindingsManager } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  encodeCalldata,
  getOptValue,
} from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getAbiItem, hexToString, namehash } from "viem";
import type AragonOS from "..";
import type { AragonDAO } from "../AragonDAO";
import { _aragonEns } from "../helpers/aragonEns";
import type { App, AppArtifact } from "../types";
import {
  buildAppArtifact,
  buildAppPermissions,
  fetchAppArtifact,
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
  dao: AragonDAO,
  app: App,
  artifact: AppArtifact,
  bindingsManager: BindingsManager,
): void => {
  dao.appArtifactCache.set(app.codeAddress, artifact);
  dao.appCache.set(app.name, app);

  bindingsManager.setBinding(
    app.codeAddress,
    app.abi,
    ABI,
    false,
    undefined,
    true,
  );
  bindingsManager.setBinding(app.address, app.abi, ABI, false, undefined, true);
};

export default defineCommand<AragonOS>({
  name: "install",
  args: [
    { name: "variable", type: "variable" },
    { name: "identifier", type: "repo" },
    { name: "params", type: "any", rest: true },
  ],
  opts: [
    { name: DAO_OPT_NAME, type: "any" },
    { name: "version", type: "any" },
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

    const { codeAddress, contentUri } = await fetchRepoData(
      appName,
      registry,
      version ?? "latest",
      await module.getClient(),
      module.getConfigBinding("ensResolver"),
    );

    const daos = module.allDAOs;
    const selectedDAOArtifacts = daos
      .filter((dao) => dao.appArtifactCache.has(codeAddress))
      .map((dao) => dao.appArtifactCache.get(codeAddress)!);
    let artifact: AppArtifact;

    if (!selectedDAOArtifacts.length) {
      const rawArtifact = await fetchAppArtifact(
        module.ipfsResolver,
        contentUri,
      );
      artifact = buildAppArtifact(rawArtifact);
    } else {
      artifact = selectedDAOArtifacts[0];
    }

    const { abi, roles } = artifact;
    const kernel = dao.kernel;
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
      artifact,
      module.bindingsManager,
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
