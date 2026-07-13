import { BindingsSpace, defineCommand } from "@evmcrispr/sdk";
import { getAddress, isAddress, zeroAddress } from "viem";
import type AragonOSx from "..";
import { DAO_FACTORY_ABI } from "../abis";
import { getDeployment, type KnownRepo } from "../addresses";
import { buildPluginInfos } from "../dao";
import { abiAction } from "../utils/encode";
import { toMetadataBytes } from "../utils/metadata";
import {
  encodeSetupData,
  fetchBuildMetadata,
  resolveVersion,
} from "../utils/psp";
import { resolveRepoAddress } from "../utils/repos";

export default defineCommand<AragonOSx>({
  name: "new-dao",
  description: "Create a new Aragon OSx DAO with an initial governance plugin.",
  args: [
    { name: "variable", type: "variable", description: "Variable name" },
    {
      name: "plugin",
      type: "repo",
      description: "Governance plugin repo (e.g. admin, token-voting)",
    },
    {
      name: "params",
      type: "any",
      rest: true,
      description: "Plugin setup parameters",
    },
  ],
  opts: [
    {
      name: "subdomain",
      type: "string",
      description: "ENS subdomain to register (e.g. `mydao` for mydao.dao.eth)",
    },
    {
      name: "dao-uri",
      type: "string",
      description: "DAO URI (EIP-4824)",
    },
    {
      name: "metadata",
      type: "string",
      description: "DAO metadata (conventionally an IPFS URI)",
    },
    {
      name: "version",
      type: "string",
      description: "Plugin version as <release>.<build> (default latest)",
    },
  ],
  async run(module, { variable, plugin: repo, params = [] }, { opts }) {
    const deployment = await getDeployment(module);
    const client = await module.getClient();

    const repoAddress = await resolveRepoAddress(module, repo);
    const version = await resolveVersion(module, repoAddress, opts.version);
    const metadata = await fetchBuildMetadata(module, version.buildMetadata);
    const inputs = metadata?.pluginSetup?.prepareInstallation?.inputs ?? [];
    const data = encodeSetupData(inputs, params as any[]);

    const daoSettings = {
      trustedForwarder: zeroAddress,
      daoURI: opts["dao-uri"] ?? "",
      subdomain: opts.subdomain ?? "",
      metadata: toMetadataBytes(opts.metadata),
    };
    const pluginSettings = [
      {
        pluginSetupRef: {
          versionTag: version.tag,
          pluginSetupRepo: repoAddress,
        },
        data,
      },
    ];

    const {
      result: [daoAddress, installedPlugins],
    } = await client.simulateContract({
      address: deployment.daoFactory,
      abi: DAO_FACTORY_ABI,
      functionName: "createDao",
      args: [daoSettings, pluginSettings],
      account: await module.getConnectedAccount(true),
    });

    module.bindingsManager.setBinding(
      variable,
      daoAddress,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    // Pre-cache the predicted DAO so a later `connect $variable` in the same
    // script works without waiting for indexing.
    const repoSubdomain = isAddress(repo)
      ? (Object.entries(deployment.repos ?? {}).find(
          ([, address]) => address.toLowerCase() === repo.toLowerCase(),
        )?.[0] as KnownRepo | undefined)
      : (repo as KnownRepo);
    module.setCachedDao(await module.getChainId(), daoAddress, {
      address: getAddress(daoAddress),
      subdomain: opts.subdomain,
      plugins: buildPluginInfos(
        installedPlugins.map((installed) => ({
          address: getAddress(installed.plugin),
          repoSubdomain,
          repoAddress,
          versionTag: version.tag,
          helpers: [...installed.preparedSetupData.helpers],
        })),
      ),
      nestingIndex: 0,
    });

    return [
      abiAction(deployment.daoFactory, DAO_FACTORY_ABI, "createDao", [
        daoSettings,
        pluginSettings,
      ]),
    ];
  },
});
