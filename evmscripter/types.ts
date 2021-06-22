import { App as ConnectApp, Address } from "@1hive/connect";
import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";

export interface Action {
  to: string;
  data: string;
  value?: BigNumber;
}

export interface ForwardOptions {
  path: Entity[];
  context: string;
}

export type App = ConnectApp & { abiInterface: Interface };

export type AppCache = Map<string, App>;

export type CounterfactualAppCache = Map<string, Address>;

export type AppIdentifier = string;

export type LabeledAppIdentifier = string;

export type Entity = AppIdentifier | LabeledAppIdentifier | Address;

export type Permission = [Entity, Entity, string];

export type CompletePermission = [...Permission, string];
