import type { AstSymbol } from "jsymbol";

import type { Param } from "../utils/encoders";
import type { ArgDef, ArgType, CustomArgTypes, OptDef } from "../utils/schema";
import type { Abi } from ".";
import type { Node } from "./ast";
import type { Commands, HelperArgDefEntry, HelperFunctions } from "./modules";

export enum BindingsSpace {
  USER = "USER",
  ABI = "ABI",
  MODULE = "MODULE",
  CACHE = "CACHE",
  DEF = "DEF",
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
  /** Argument definitions for each helper (keyed by helper name). */
  helperArgDefs?: Record<string, HelperArgDefEntry[]>;
  /** Human-readable descriptions for each helper (keyed by helper name). */
  helperDescriptions?: Record<string, string>;
  /** Human-readable descriptions for each command (keyed by command name). */
  commandDescriptions?: Record<string, string>;
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

export interface UserBinding extends IBinding<Param> {
  type: BindingsSpace.USER;
}

export interface CacheBinding extends IBinding<Param> {
  type: BindingsSpace.CACHE;
}

export interface DefValue {
  kind: "command" | "helper";
  run: Function;
  argDefs: ArgDef[];
  optDefs?: OptDef[];
  returnType?: ArgType;
  bodyNode: Node;
}

export interface DefBinding extends IBinding<DefValue> {
  type: BindingsSpace.DEF;
}

export type Binding =
  | AbiBinding
  | ModuleBinding
  | UserBinding
  | CacheBinding
  | DefBinding;

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
          : B extends BindingsSpace.DEF
            ? DefBinding
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
          : B extends BindingsSpace.DEF
            ? NullableBinding<DefBinding>
            : any;
