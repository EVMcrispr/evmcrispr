import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { DAO_ABI } from "../abis";
import { getDeployment } from "../addresses";
import { abiAction } from "../utils/encode";
import {
  encodeSetupData,
  fetchBuildMetadata,
  hashHelpers,
  PSP_ABI,
  resolveVersion,
  UPGRADE_PLUGIN_PERMISSION_ID,
  withRootGrant,
} from "../utils/psp";

export default defineCommand<AragonOSx>({
  name: "upgrade",
  description:
    "Update an installed plugin to a newer build via the Plugin Setup Processor.",
  args: [
    {
      name: "plugin",
      type: "plugin",
      description: "Installed plugin to update",
    },
    {
      name: "params",
      type: "any",
      rest: true,
      description: "Plugin update parameters",
    },
  ],
  opts: [
    {
      name: "version",
      type: "string",
      description: "Target version as <release>.<build> (default latest build)",
    },
  ],
  async run(
    module,
    { plugin: pluginIdentifier, params = [] },
    { opts, interpreters },
  ) {
    const batchName = interpreters.batchContext?.name;
    if (batchName !== "propose" && batchName !== "act") {
      throw new ErrorException(
        'upgrade must be used within a "propose" or "act" command: only the DAO itself can apply an update',
      );
    }

    const { dao, plugin } = module.resolvePlugin(pluginIdentifier, "upgrade");

    if (!plugin.repoAddress || !plugin.versionTag) {
      throw new ErrorException(
        `plugin ${plugin.identifier} comes from an unknown repo and can't be upgraded with this command`,
      );
    }

    const deployment = await getDeployment(module);
    const psp = deployment.pluginSetupProcessor;
    const client = await module.getClient();

    const newVersion = await resolveVersion(
      module,
      plugin.repoAddress,
      opts.version,
    );

    if (newVersion.tag.release !== plugin.versionTag.release) {
      throw new ErrorException(
        `OSx only updates within a release: plugin is on release ${plugin.versionTag.release}, target is ${newVersion.tag.release}`,
      );
    }
    if (newVersion.tag.build <= plugin.versionTag.build) {
      throw new ErrorException(
        `plugin ${plugin.identifier} is already on build ${plugin.versionTag.build} (target: ${newVersion.tag.build})`,
      );
    }

    const metadata = await fetchBuildMetadata(module, newVersion.buildMetadata);
    const inputs =
      metadata?.pluginSetup?.prepareUpdate?.[String(newVersion.tag.build)]
        ?.inputs ?? [];
    const data = encodeSetupData(inputs, params as any[]);

    const setupPayload = {
      plugin: plugin.address,
      currentHelpers: plugin.helpers,
      data,
    };
    const updateParams = {
      currentVersionTag: plugin.versionTag,
      newVersionTag: newVersion.tag,
      pluginSetupRepo: plugin.repoAddress,
      setupPayload,
    };

    const {
      result: [initData, preparedSetupData],
    } = await client.simulateContract({
      address: psp,
      abi: PSP_ABI,
      functionName: "prepareUpdate",
      args: [dao.address, updateParams],
      account: dao.address,
    });

    plugin.versionTag = newVersion.tag;
    plugin.helpers = [...preparedSetupData.helpers];

    return [
      abiAction(psp, PSP_ABI, "prepareUpdate", [dao.address, updateParams]),
      abiAction(dao.address, DAO_ABI, "grant", [
        plugin.address,
        psp,
        UPGRADE_PLUGIN_PERMISSION_ID,
      ]),
      ...withRootGrant(dao.address, psp, [
        abiAction(psp, PSP_ABI, "applyUpdate", [
          dao.address,
          {
            plugin: plugin.address,
            pluginSetupRef: {
              versionTag: newVersion.tag,
              pluginSetupRepo: plugin.repoAddress,
            },
            initData,
            permissions: preparedSetupData.permissions,
            helpersHash: hashHelpers(preparedSetupData.helpers),
          },
        ]),
      ]),
      abiAction(dao.address, DAO_ABI, "revoke", [
        plugin.address,
        psp,
        UPGRADE_PLUGIN_PERMISSION_ID,
      ]),
    ];
  },
});
