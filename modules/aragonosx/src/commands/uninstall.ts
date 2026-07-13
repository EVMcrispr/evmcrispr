import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { getDeployment } from "../addresses";
import { abiAction } from "../utils/encode";
import {
  encodeSetupData,
  fetchBuildMetadata,
  PSP_ABI,
  resolveVersion,
  withRootGrant,
} from "../utils/psp";

export default defineCommand<AragonOSx>({
  name: "uninstall",
  description:
    "Uninstall a plugin from the connected DAO via the Plugin Setup Processor.",
  args: [
    {
      name: "plugin",
      type: "plugin",
      description: "Installed plugin to remove",
    },
    {
      name: "params",
      type: "any",
      rest: true,
      description: "Plugin uninstallation parameters",
    },
  ],
  async run(
    module,
    { plugin: pluginIdentifier, params = [] },
    { interpreters },
  ) {
    const batchName = interpreters.batchContext?.name;
    if (batchName !== "propose" && batchName !== "act") {
      throw new ErrorException(
        'uninstall must be used within a "propose" or "act" command: only the DAO itself can apply an uninstallation',
      );
    }

    const { dao, plugin } = module.resolvePlugin(pluginIdentifier, "uninstall");

    if (!plugin.repoAddress || !plugin.versionTag) {
      throw new ErrorException(
        `plugin ${plugin.identifier} comes from an unknown repo and can't be uninstalled with this command`,
      );
    }

    const deployment = await getDeployment(module);
    const psp = deployment.pluginSetupProcessor;
    const client = await module.getClient();

    let data: `0x${string}` = "0x";
    if ((params as any[]).length) {
      const version = await resolveVersion(
        module,
        plugin.repoAddress,
        `${plugin.versionTag.release}.${plugin.versionTag.build}`,
      );
      const metadata = await fetchBuildMetadata(module, version.buildMetadata);
      const inputs = metadata?.pluginSetup?.prepareUninstallation?.inputs ?? [];
      data = encodeSetupData(inputs, params as any[]);
    }

    const pluginSetupRef = {
      versionTag: plugin.versionTag,
      pluginSetupRepo: plugin.repoAddress,
    };
    const setupPayload = {
      plugin: plugin.address,
      currentHelpers: plugin.helpers,
      data,
    };

    const { result: permissions } = await client.simulateContract({
      address: psp,
      abi: PSP_ABI,
      functionName: "prepareUninstallation",
      args: [dao.address, { pluginSetupRef, setupPayload }],
      account: dao.address,
    });

    dao.plugins.splice(dao.plugins.indexOf(plugin), 1);

    return [
      abiAction(psp, PSP_ABI, "prepareUninstallation", [
        dao.address,
        { pluginSetupRef, setupPayload },
      ]),
      ...withRootGrant(dao.address, psp, [
        abiAction(psp, PSP_ABI, "applyUninstallation", [
          dao.address,
          { plugin: plugin.address, pluginSetupRef, permissions },
        ]),
      ]),
    ];
  },
});
