import type { utils } from 'ethers';

export type Abi = (utils.EventFragment | utils.FunctionFragment)[];

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
  abi: Abi;
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
 * A call script.
 */
export interface CallScriptAction {
  /**
   * The action's target.
   */
  to: string;
  /**
   * The action's calldata.
   */
  data: string;
}
