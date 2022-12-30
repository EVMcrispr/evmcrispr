import type { Address } from '@1hive/evmcrispr';
import type { utils } from 'ethers';

import type { PermissionMap } from './permission';

/**
 * An object that contains app data.
 */
export interface App {
  /**
   * The app's contract ABI [Interface](https://docs.ethers.io/v5/api/utils/abi/interface/).
   */
  abiInterface: utils.Interface;
  /**
   * The app's address.
   */
  address: Address;
  /**
   * The app's base contract address.
   */
  codeAddress: Address;
  /**
   * The IPFS content identifier the app's data is located on.
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

export interface AppMethod {
  roles: string[];
  sig: string;
  params?: any[];
  /**
   * This field might not be able if the contract does not use
   * conventional solidity syntax and Aragon naming standards
   * null if there in no notice
   */
  notice: string | null;
}

export interface AragonEnvironment {
  network: string;
  registry?: string;
  appName?: string;
  gasPrice?: string;
  wsRPC?: string;
  appId?: string;
}

export interface AragonEnvironments {
  [environmentName: string]: AragonEnvironment;
}

export interface AragonAppJson {
  roles: AragonArtifactRole[];
  environments: AragonEnvironments;
  path: string;
  dependencies?: {
    appName: string; // 'vault.aragonpm.eth'
    version: string; // '^4.0.0'
    initParam: string; // '_vault'
    state: string; // 'vault'
    requiredPermissions: {
      name: string; // 'TRANSFER_ROLE'
      params: string; // '*'
    }[];
  }[];
  /**
   * If the appName is different per network use environments
   * ```ts
   * environments: {
   *   rinkeby: {
   *     appName: "myapp.open.aragonpm.eth"
   *   }
   * }
   * ```
   */
  appName?: string;
  env?: AragonEnvironment;
}

export interface AragonArtifact extends AragonAppJson {
  roles: AragonArtifactRole[];
  abi: (utils.EventFragment | utils.FunctionFragment)[];
  /**
   * All publicly accessible functions
   * Includes metadata needed for radspec and transaction pathing
   * initialize() function should also be included for completeness
   */
  functions: AppMethod[];
  /**
   * Functions that are no longer available at `version`
   */
  deprecatedFunctions: {
    [version: string]: AppMethod[];
  };
  /**
   * The flaten source code of the contracts must be included in
   * any type of release at this path
   */
  flattenedCode: string; // "./code.sol"
  appId: string;
  appName: string;
}

export interface AragonArtifactRole {
  name: string; // 'Create new payments'
  id: string; // 'CREATE_PAYMENTS_ROLE'
  params: string[]; //  ['Token address', ... ]
  bytes: string; // '0x5de467a460382d13defdc02aacddc9c7d6605d6d4e0b8bd2f70732cae8ea17bc'
}

/** @internal */
export interface AppArtifact {
  abiInterface: utils.Interface;
  appName: string;
  roles: AragonArtifactRole[];
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

/** @internal */
export interface ArtifactData {
  abiInterface: utils.Interface;
  roles: any[];
}

/**
 * A string similar to [[AppIdentifier]] that follows the format `<AppName>:<Label>` (e.g. `vault:main-org-reserve`):
 *
 * - **AppName**: Same as the one defined on [[AppIdentifier]].
 * - **Label**: A non-numeric string that identifies a new installed app.
 */
export type LabeledAppIdentifier = string;
