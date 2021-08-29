import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";

/**
 * A string that contains an Ethereum address.
 */
export type Address = string;

/**
 * @internal
 * A string that contains a permission's name hashed.
 */

export type RoleHash = string;

/**
 * An object that represents an action in the DAO (e.g. installing a new app, minting tokens, etc).
 */
export interface Action {
  /**
   * The recipient address.
   */
  to: string;
  /**
   * The encoded action. It can be conceived of as contract function calls.
   */
  data: string;
  /**
   * The ether which needs to be sent along with the action (in wei).
   */
  value?: BigNumber;
}

export interface ForwardOptions {
  /**
   * The context information describing the forward evmscript.
   * Needed for forwarders with context (AragonOS v5)
   */
  context?: string;
}

/**
 * @internal
 * An object that contains an app's permission data.
 */
export interface Role {
  /**
   * The permission manager address.
   */
  manager: Address;
  /**
   * The entities that are allowed to perform this permission.
   */
  grantees: Set<Address>;
}

/** @internal */
export type PermissionMap = Map<RoleHash, Role>;

/**
 * @internal
 * An object that contains app data.
 */
export interface App {
  /**
   * The app's address.
   */
  address: Address;
  /**
   * The app's base contract address.
   */
  codeAddress: Address;
  /**
   * The app's name
   */
  name: string;
  /**
   * The IPFS content identifier the app's data is located on.
   */
  contentUri: string;
  /**
   * The app's contract ABI.
   */
  abi: string;
  /**
   * The app's contract ABI [Interface](https://docs.ethers.io/v5/api/utils/abi/interface/).
   */
  abiInterface: Interface;
  /**
   * The app's permissions.
   */
  permissions: PermissionMap;
}

/**
 * @internal
 * An object that contains the app's repo data
 */
export interface Repo {
  /**
   * The repo's app artifact.
   */
  artifact: any;
  /**
   * The IPFS content identifier the repo's app data is located on.
   */
  contentUri: string;
  /**
   * The repo's app base contract address.
   */
  codeAddress: string;
}

export type RawAction = Action | Action[] | Promise<Action>;

export type ActionFunction = () => RawAction;

export type Function<T extends any> = () => T;

/**
 * A string that follows the format `<AppName>[:<Label>]`:
 *
 * - **AppName**: Name of the app as it appears in the APM excluding the ens registry name. For example: the
 * app name of `voting.aragonpm.eth` is `voting`.
 * - **Label**: Used when more than one app of the same type is installed. It's usually is numeric, starting
 * from 0 (e.g. agent:2). The user can also define non-numeric labels to identify new installed apps
 * (e.g. `vault:main-org-reserve`).
 */
export type AppIdentifier = string;

/**
 * A string that extends [[AppIdentifier]] and it can be used to define non-numeric labels to identify new installed apps
 * (e.g. `vault:main-org-reserve`).
 */
export type LabeledAppIdentifier = string;

/**
 * A string which can be a [[AppIdentifier]], [[LabeledAppIdentifier]] or [[Address]].
 */
export type Entity = AppIdentifier | LabeledAppIdentifier | Address;

/**
 * An array which follows the format `[<Grantee>, <App>, <Role>]`.
 *
 * - **Grantee**: Entity that will be able to perform the permission.
 * - **App**: App entity that holds the allowed permission.
 * - **Role**: The permission's name.
 */
export type Permission = [Entity, Entity, string];

/**
 * An array which follows the format `[<Grantee>, <App>, <Role>, <Manager>]`
 *
 * - **Grantee**: Entity that will be able to perform the permission.
 * - **App**: App entity that holds the allowed permission.
 * - **Role**: The permission's name.
 * - **Manager**: Entity that will act as the permission manager.
 */
export type CompletePermission = [...Permission, string];

/**
 * A map which contains the DAO's apps indexed by their identifier ([[AppIdentifier]] or [[LabeledAppIdentifier]]).
 */
export type AppCache = Map<AppIdentifier | LabeledAppIdentifier, App>;

/**
 * @internal
 * A map which contains the app's [Interface](https://docs.ethers.io/v5/api/utils/abi/interface/)
 * indexed by the app's base contract address.
 */
export type AppInterfaceCache = Map<Address, Interface>;
