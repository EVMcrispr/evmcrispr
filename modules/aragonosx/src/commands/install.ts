import { BindingsSpace, defineCommand, ErrorException } from "@evmcrispr/sdk";
import { getAddress, isAddress } from "viem";
import type AragonOSx from "..";
import { getDeployment, type KnownRepo } from "../addresses";
import { abiAction } from "../utils/encode";
import {
  encodeSetupData,
  fetchBuildMetadata,
  hashHelpers,
  PSP_ABI,
  resolveVersion,
  withRootGrant,
} from "../utils/psp";
import { resolveRepoAddress } from "../utils/repos";

export default defineCommand<AragonOSx>({
  name: "install",
  description:
    "Install a plugin into the connected DAO via the Plugin Setup Processor.",
  args: [
    { name: "variable", type: "variable", description: "Variable name" },
    {
      name: "repo",
      type: "repo",
      description: "Plugin repo subdomain or address",
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
      name: "version",
      type: "string",
      description: "Version to install as <release>.<build> (default latest)",
    },
  ],
  async run(module, { variable, repo, params = [] }, { opts, interpreters }) {
    const batchName = interpreters.batchContext?.name;
    if (batchName !== "propose" && batchName !== "act") {
      throw new ErrorException(
        'install must be used within a "propose" or "act" command: only the DAO itself can apply an installation',
      );
    }

    const dao = module.requireCurrentDAO("install");
    const deployment = await getDeployment(module);
    const psp = deployment.pluginSetupProcessor;
    const client = await module.getClient();

    const repoAddress = await resolveRepoAddress(module, repo);
    const version = await resolveVersion(module, repoAddress, opts.version);

    const metadata = await fetchBuildMetadata(module, version.buildMetadata);
    const inputs = metadata?.pluginSetup?.prepareInstallation?.inputs ?? [];
    const data = encodeSetupData(inputs, params as any[]);

    const pluginSetupRef = {
      versionTag: version.tag,
      pluginSetupRepo: repoAddress,
    };

    const {
      result: [pluginAddress, preparedSetupData],
    } = await client.simulateContract({
      address: psp,
      abi: PSP_ABI,
      functionName: "prepareInstallation",
      args: [dao.address, { pluginSetupRef, data }],
      account: dao.address,
    });

    module.bindingsManager.setBinding(
      variable,
      pluginAddress,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    // Register the predicted plugin so later commands in the same script can
    // reference it by identifier.
    const repoSubdomain = isAddress(repo)
      ? Object.entries(deployment.repos ?? {}).find(
          ([, address]) => address.toLowerCase() === repo.toLowerCase(),
        )?.[0]
      : repo;
    const count = dao.plugins.filter(
      (p) => p.repoSubdomain === repoSubdomain,
    ).length;
    dao.plugins.push({
      address: getAddress(pluginAddress),
      identifier: repoSubdomain
        ? count === 0
          ? repoSubdomain
          : `${repoSubdomain}:${count}`
        : pluginAddress.toLowerCase(),
      repoSubdomain: repoSubdomain as KnownRepo | undefined,
      repoAddress,
      versionTag: version.tag,
      helpers: [...preparedSetupData.helpers],
    });

    return [
      abiAction(psp, PSP_ABI, "prepareInstallation", [
        dao.address,
        { pluginSetupRef, data },
      ]),
      ...withRootGrant(dao.address, psp, [
        abiAction(psp, PSP_ABI, "applyInstallation", [
          dao.address,
          {
            pluginSetupRef,
            plugin: pluginAddress,
            permissions: preparedSetupData.permissions,
            helpersHash: hashHelpers(preparedSetupData.helpers),
          },
        ]),
      ]),
    ];
  },
});
