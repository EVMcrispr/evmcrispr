import type { AstSymbol } from "jsymbol";

import type { ArgType, CustomArgTypes } from "../utils/schema";
import type { Abi } from ".";
import type { Commands, HelperFunctions } from "./modules";

export enum BindingsSpace {
  USER = "USER",
  ABI = "ABI",
  MODULE = "MODULE",
  CACHE = "CACHE",
}

export type Nullable<T> = T | null;

export interface IBinding<V> extends AstSymbol<BindingsSpace> {
  type: BindingsSpace;
  value: Nullable<V>;
  parent?: IBinding<V>;
}

export type NoNullableBinding<B extends Binding = Binding> = Omit<
  B,
  "value"
> & {
  value: NonNullable<B["value"]>;
};

export type ModuleData = {
  commands: Commands<any>;
  helpers: HelperFunctions<any>;
  /** Return type declared by each helper (keyed by helper name). */
  helperReturnTypes?: Record<string, ArgType>;
  /** Whether each helper accepts arguments (keyed by helper name). */
  helperHasArgs?: Record<string, boolean>;
  types?: CustomArgTypes;
  /** When a module is loaded with `--as`, the alias is stored here. */
  alias?: string;
};

export interface AbiBinding extends IBinding<Abi> {
  type: BindingsSpace.ABI;
}

export interface ModuleBinding extends IBinding<ModuleData> {
  type: BindingsSpace.MODULE;
}

export interface UserBinding extends IBinding<string> {
  type: BindingsSpace.USER;
}

export interface CacheBinding extends IBinding<string> {
  type: BindingsSpace.CACHE;
}

export type Binding = AbiBinding | ModuleBinding | UserBinding | CacheBinding;

export type NullableBinding<B extends Binding = Binding> = Omit<B, "value"> & {
  value: null | B["value"];
};

export type RelativeBinding<B extends BindingsSpace> =
  B extends BindingsSpace.ABI
    ? AbiBinding
    : B extends BindingsSpace.MODULE
      ? ModuleBinding
      : B extends BindingsSpace.USER
        ? UserBinding
        : B extends BindingsSpace.CACHE
          ? CacheBinding
          : unknown;

export type RelativeNullableBinding<B extends BindingsSpace> =
  B extends BindingsSpace.ABI
    ? NullableBinding<AbiBinding>
    : B extends BindingsSpace.MODULE
      ? NullableBinding<ModuleBinding>
      : B extends BindingsSpace.USER
        ? NullableBinding<UserBinding>
        : B extends BindingsSpace.CACHE
          ? NullableBinding<CacheBinding>
          : any;
