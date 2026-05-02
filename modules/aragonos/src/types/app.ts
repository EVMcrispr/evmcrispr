import type { Abi, Address } from "@evmcrispr/sdk";
import type { PermissionMap } from "./permission";

/**
 * An object that contains app data.
 */
export interface App {
  /**
   * The app's contract ABI [Interface](https://docs.ethers.io/v5/api/utils/abi/interface/).
   */
  abi: Abi;
  /**
   * The app's address.
   */
  address: Address;
  /**
   * The app's base contract address.
   */
  codeAddress: Address;
  /**
   * The app's aragonPM content URI, when available from the subgraph.
   */
  contentUri: string;
  /**
   * The app's name.
   */
  name: string;
  /**
   * The app's permissions.
   */
  permissions: PermissionMap;
  /**
   * The app's aragonPM ens registry name.
   */
  registryName: string;
}

export interface AppRole {
  name: string;
  id: string;
  params: string[];
  bytes: string;
}

/** @internal */
export interface AppResource {
  abi: Abi;
  appName: string;
  roles: AppRole[];
  functions: { sig: string }[];
}

/**
 * A string that follows the format `<AppName>[:<Index>]` (e.g. `vault:0`):
 *
 * - **AppName**: Name of the app as it appears in the APM excluding the ens registry name. For example: the
 * app name of `voting.aragonpm.eth` is `voting`.
 * - **Index**: A numeric value starting at 0 used when more than one app of the same type is installed. It
 * follows a chronological installation order (e.g. `app:0` was installed before `app:1`).
 * When the index is omitted, EVMcrispr assumes you're referencing the app with index zero.
 */
export type AppIdentifier = string;

/**
 * A string similar to [[AppIdentifier]] that follows the format `<AppName>:<Label>` (e.g. `vault:main-org-reserve`):
 *
 * - **AppName**: Same as the one defined on [[AppIdentifier]].
 * - **Label**: A non-numeric string that identifies a new installed app.
 */
export type LabeledAppIdentifier = string;
