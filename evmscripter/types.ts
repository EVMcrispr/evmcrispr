import { Address } from "@1hive/connect";
import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";

export type RoleHash = string;

export interface Action {
  to: string;
  data: string;
  value?: BigNumber;
}

export interface ForwardOptions {
  path: Entity[];
  context: string;
}

export interface Role {
  manager: Address;
  grantees: Set<Address>;
}

export type PermissionMap = Map<RoleHash, Role>;

export interface App {
  address: Address;
  codeAddress: Address;
  name: string;
  contentUri: string;
  abi: string;
  abiInterface?: Interface;
  permissions?: PermissionMap;
}

export interface Repo {
  artifact: any;
  contentUri: string;
  codeAddress: string;
}

export type RawAction = Action | Action[] | Promise<Action>;

export type Function<T extends RawAction> = () => T;

export type IpfsCID = string;

export type AppIdentifier = string;

export type LabeledAppIdentifier = string;

export type Entity = AppIdentifier | LabeledAppIdentifier | Address;

export type Permission = [Entity, Entity, string];

export type CompletePermission = [...Permission, string];

export type AppCache = Map<AppIdentifier | LabeledAppIdentifier, App>;

export type AppInterfaceCache = Map<Address, Interface>;
