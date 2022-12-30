import type { Address } from '@1hive/evmcrispr';

import type { AddressSet } from '../AddressSet';
import type { AppIdentifier, LabeledAppIdentifier } from './app';

/**
 * An array which follows the format `[<Grantee>, <App>, <Role>, <Manager>]`
 *
 * - **Grantee**: Entity that will be able to perform the permission.
 * - **App**: App entity that holds the allowed permission.
 * - **Role**: The permission's name.
 * - **Params**: Function that returns an array of encoded ACL parameters.
 * - **Manager**: Entity that will act as the permission manager.
 */
export type CompletePermission = [
  Entity,
  Entity,
  string,
  string?,
  ReturnType<Params>?,
];

/**
 * A string which can be a [[AppIdentifier]], [[LabeledAppIdentifier]] or [[Address]].
 */
export type Entity = AppIdentifier | LabeledAppIdentifier | Address;

/**
 * The role's keccak256 hash.
 */
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

export type FullPermission = [...Permission, string?];

/**
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
  grantees: AddressSet;
}

/**
 * A map which contains a set of [[Role]] indexed by their [[RoleHash]].
 */
export type PermissionMap = Map<RoleHash, Role>;
