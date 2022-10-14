import type { utils } from 'ethers';
import type { AstSymbol } from 'jsymbol';

import type { BindingsManager } from '../BindingsManager';

import type { Commands, HelperFunctions, IDataProvider } from './modules';

export enum BindingsSpace {
  USER = 'USER',
  ADDR = 'ADDR',
  ABI = 'ABI',
  DATA_PROVIDER = 'DATA_PROVIDER',
  MODULE = 'MODULE',
  INTERPRETER = 'INTERPRETER',
  ALIAS = 'ALIAS',
}

export interface IBinding<V> extends AstSymbol<BindingsSpace> {
  type: BindingsSpace;
  value: V;
  parent?: IBinding<V>;
}

export type ModuleData = {
  commands: Commands<any>;
  helpers: HelperFunctions<any>;
};

export interface AddressBinding extends IBinding<string> {
  type: BindingsSpace.ADDR;
}

export interface AbiBinding extends IBinding<utils.Interface> {
  type: BindingsSpace.ABI;
}

export interface ModuleBinding extends IBinding<ModuleData> {
  type: BindingsSpace.MODULE;
}

export interface UserBinding extends IBinding<string> {
  type: BindingsSpace.USER;
}

export interface AliasBinding extends IBinding<string> {
  type: BindingsSpace.ALIAS;
}

export interface DataProviderBinding<T extends IDataProvider = IDataProvider>
  extends IBinding<T> {
  type: BindingsSpace.DATA_PROVIDER;
}

export interface InterpreterBinding extends IBinding<string> {
  type: BindingsSpace.INTERPRETER;
}

export type LazyBindings = (currentBindingsManager: BindingsManager) => void;

export type Binding =
  | AddressBinding
  | AbiBinding
  | ModuleBinding
  | UserBinding
  | AliasBinding
  | DataProviderBinding
  | InterpreterBinding;

export type RelativeBinding<B extends BindingsSpace> =
  B extends BindingsSpace.ABI
    ? AbiBinding
    : B extends BindingsSpace.ADDR
    ? AddressBinding
    : B extends BindingsSpace.ALIAS
    ? AliasBinding
    : B extends BindingsSpace.MODULE
    ? ModuleBinding
    : B extends BindingsSpace.DATA_PROVIDER
    ? DataProviderBinding
    : B extends BindingsSpace.USER
    ? UserBinding
    : B extends BindingsSpace.INTERPRETER
    ? InterpreterBinding
    : any;
