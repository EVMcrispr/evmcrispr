import type { Action, Address } from "@evmcrispr/sdk";
import { ErrorException, encodeCalldata } from "@evmcrispr/sdk";
import type { AbiFunction, AbiParameter, Hex } from "viem";
import { encodeAbiParameters, hexToString, keccak256 } from "viem";
import type AragonOSx from "..";
import { DAO_ABI, PLUGIN_REPO_ABI, PSP_ABI } from "../abis";
import type { VersionTag } from "../types";
import { abiAction } from "./encode";
import { permissionId } from "./permissions";

export const ROOT_PERMISSION_ID = permissionId("ROOT");
export const UPGRADE_PLUGIN_PERMISSION_ID = permissionId("UPGRADE_PLUGIN");

const VERSION_REGEX = /^(\d+)\.(\d+)$/;

export interface ResolvedVersion {
  repoAddress: Address;
  tag: VersionTag;
  pluginSetup: Address;
  buildMetadata: Hex;
}

/** Resolve a repo version: `--version <release>.<build>` or the latest. */
export async function resolveVersion(
  module: AragonOSx,
  repoAddress: Address,
  versionOpt?: string,
): Promise<ResolvedVersion> {
  const client = await module.getClient();

  let version: {
    tag: { release: number; build: number };
    pluginSetup: Address;
    buildMetadata: Hex;
  };

  if (versionOpt) {
    const match = VERSION_REGEX.exec(versionOpt);
    if (!match) {
      throw new ErrorException(
        `invalid --version option. Expected <release>.<build> (e.g. 1.3), got ${versionOpt}`,
      );
    }
    version = await client.readContract({
      address: repoAddress,
      abi: PLUGIN_REPO_ABI,
      functionName: "getVersion",
      args: [{ release: Number(match[1]), build: Number(match[2]) }],
    });
  } else {
    const latestRelease = await client.readContract({
      address: repoAddress,
      abi: PLUGIN_REPO_ABI,
      functionName: "latestRelease",
    });
    version = await client.readContract({
      address: repoAddress,
      abi: PLUGIN_REPO_ABI,
      functionName: "getLatestVersion",
      args: [latestRelease],
    });
  }

  return {
    repoAddress,
    tag: { release: version.tag.release, build: version.tag.build },
    pluginSetup: version.pluginSetup,
    buildMetadata: version.buildMetadata,
  };
}

/** Fetch and parse the version's build metadata JSON from IPFS. */
export async function fetchBuildMetadata(
  module: AragonOSx,
  buildMetadata: Hex,
): Promise<Record<string, any>> {
  const uri = hexToString(buildMetadata);
  const cid = uri.replace(/^ipfs:\/\//, "");
  if (!cid) return {};
  try {
    return await module.ipfsResolver.json(cid);
  } catch {
    return {};
  }
}

/**
 * ABI-encode plugin setup parameters against the inputs declared in the
 * version's build metadata.
 */
export function encodeSetupData(inputs: AbiParameter[], params: any[]): Hex {
  if (!inputs.length) {
    if (params.length) {
      throw new ErrorException(
        `this plugin setup takes no parameters, got ${params.length}`,
      );
    }
    return "0x";
  }

  // Reuse the SDK's param coercion by encoding a synthetic call and
  // stripping the 4-byte selector.
  const fragment: AbiFunction = {
    type: "function",
    name: "setup",
    stateMutability: "nonpayable",
    inputs,
    outputs: [],
  };
  return `0x${encodeCalldata(fragment, params).slice(10)}`;
}

/** `hashHelpers` from PluginSetupProcessorHelpers: keccak256(abi.encode(helpers)). */
export function hashHelpers(helpers: readonly Address[]): Hex {
  return keccak256(encodeAbiParameters([{ type: "address[]" }], [helpers]));
}

/**
 * Wrap a PSP `apply*` call with the temporary ROOT grant the processor needs
 * to modify the DAO's permissions. Runs inside a `dao.execute`, so the whole
 * sequence is atomic.
 */
export function withRootGrant(
  dao: Address,
  psp: Address,
  actions: Action[],
): Action[] {
  return [
    abiAction(dao, DAO_ABI, "grant", [dao, psp, ROOT_PERMISSION_ID]),
    ...actions,
    abiAction(dao, DAO_ABI, "revoke", [dao, psp, ROOT_PERMISSION_ID]),
  ];
}

export { PSP_ABI };
