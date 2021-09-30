import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AragonArtifact, AragonArtifactRole } from "@1hive/connect-core/dist/cjs/types";

export { AragonArtifact } from "@1hive/connect-core/dist/cjs/types";

// ---------------------- TYPES ----------------------

export type ActionInterpreter = {
  installNewApp(identifier: LabeledAppIdentifier, initParams: any[]): ActionFunction;
  call(appIdentifier: AppIdentifier | LabeledAppIdentifier): any;
  act(agent: AppIdentifier, target: Entity, signature: string, params: any[]): ActionFunction;
  addPermission(permission: Permission | PermissionP, defaultPermissionManager: Entity): ActionFunction;
  revokePermission(permission: Permission, removeManager: boolean | undefined): ActionFunction;
};

export type ActionFunction = () => RawAction;

/**
 * A string that contains an Ethereum address.
 */
export type Address = string;

/** @internal */
export type AppArtifactCache = Map<Address, { abiInterface: Interface; roles: AragonArtifactRole[] }>;

/**
 * A map which contains the DAO's apps indexed by their identifier ([[AppIdentifier]] or [[LabeledAppIdentifier]]).
 */
export type AppCache = Map<AppIdentifier | LabeledAppIdentifier, App>;

/**
 * A string that follows the format `<AppName>[:<Index>]` (e.g. `vault:1`):
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
  abiInterface: Interface;
  roles: any[];
}

/**
 * An array which follows the format `[<Grantee>, <App>, <Role>, <Manager>]`
 *
 * - **Grantee**: Entity that will be able to perform the permission.
 * - **App**: App entity that holds the allowed permission.
 * - **Role**: The permission's name.
 * - **Params**: Function that returns an array of encoded ACL parameters.
 * - **Manager**: Entity that will act as the permission manager.
 */
export type CompletePermission = [Entity, Entity, string, Params, string];

/**
 * A string which can be a [[AppIdentifier]], [[LabeledAppIdentifier]] or [[Address]].
 */
export type Entity = AppIdentifier | LabeledAppIdentifier | Address;

/**
 * A string similar to [[AppIdentifier]] that follows the format `<AppName>:<Label>` (e.g. `vault:main-org-reserve`):
 *
 * - **AppName**: Same as the one defined on [[AppIdentifier]].
 * - **Label**: A non-numeric string that identifies a new installed app.
 */
export type LabeledAppIdentifier = string;

/** @internal */
export type RoleHash = string;

/**
 * A function that returns an array of encoded ACL parameters.
 * It can be generated with the following ACL util functions, or a combination of them:
 * - arg(argId)[opId](value)
 * - blockNumber[opId](value)
 * - timestamp[opId](value)
 * - oracle(oracleAddr)
 * - not(param)
 * - and(param1, param2)
 * - or(param1, param2)
 * - xor(param1, param2)
 * - iff(param1).then(param2).else(param3)
 * - paramValue[opId](value)
 */
export type Params = (index?: number) => string[];

/**
 * An array which follows the format `[<Grantee>, <App>, <Role>]`.
 *
 * - **Grantee**: Entity that will be able to perform the permission.
 * - **App**: App entity that holds the allowed permission.
 * - **Role**: The permission's name.
 */
export type Permission = [Entity, Entity, string];

/** @internal */
export type PermissionMap = Map<RoleHash, Role>;

/**
 * An array which follows the format `[<Grantee>, <App>, <Role>, <Manager>]`
 *
 * - **Grantee**: Entity that will be able to perform the permission.
 * - **App**: App entity that holds the allowed permission.
 * - **Role**: The permission's name.
 * - **Params**: Function that returns an array of encoded ACL parameters.
 * - **Manager**: Entity that will act as the permission manager.
 */
export type PermissionP = [Entity, Entity, string, Params];

export type RawAction = Action | Action[] | Promise<Action>;

// ---------------------- INTERFACES ----------------------

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

/**
 * An object that contains app data.
 */
export interface App {
  /**
   * The app's contract ABI [Interface](https://docs.ethers.io/v5/api/utils/abi/interface/).
   */
  abiInterface: Interface;
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
   * The app's name
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

/**
 * The EVMcrispr optional configuration object.
 */
export interface EVMcrisprOptions {
  /**
   * An IPFS gateway url to fetch app data from.
   */
  ipfsGateway: string;
}

export interface ForwardOptions {
  /**
   * The context information describing the forward evmscript.
   * Needed for forwarders with context (AragonOS v5)
   */
  context?: string;
}

/** @internal */
export interface ParsedApp {
  address: Address;
  artifact: AragonArtifact;
  appId: string;
  codeAddress: string;
  contentUri: string;
  name: string;
  registryName: string;
  roles: { roleHash: string; manager: string; grantees: { granteeAddress: Address }[] }[];
}

/**
 * An object that contains the app's repo data.
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

/**
 * @internal
 * An object that contains an app's permission data.
 */
export interface Role {
  /**
   * The permission manager address.
   */
  manager?: Address;
  /**
   * The entities that are allowed to perform this permission.
   */
  grantees: Set<Address>;
}
