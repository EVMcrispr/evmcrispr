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
  OTHER = 'OTHER',
  ALIAS = 'ALIAS',
}

export type Nullable<T> = T | null;

export interface IBinding<V> extends AstSymbol<BindingsSpace> {
  type: BindingsSpace;
  value: Nullable<V>;
  parent?: IBinding<V>;
}

export type NoNullableBinding<B extends Binding = Binding> = Omit<
  B,
  'value'
> & {
  value: NonNullable<B['value']>;
};

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

export interface OtherBinding extends IBinding<string> {
  type: BindingsSpace.OTHER;
}

export type LazyBindings = (currentBindingsManager: BindingsManager) => void;

export type Binding =
  | AddressBinding
  | AbiBinding
  | ModuleBinding
  | UserBinding
  | AliasBinding
  | DataProviderBinding
  | OtherBinding;

export type NullableBinding<B extends Binding = Binding> = Omit<B, 'value'> & {
  value: null | B['value'];
};

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
    : B extends BindingsSpace.OTHER
    ? OtherBinding
    : unknown;

export type RelativeNullableBinding<B extends BindingsSpace> =
  B extends BindingsSpace.ABI
    ? NullableBinding<AbiBinding>
    : B extends BindingsSpace.ADDR
    ? NullableBinding<AddressBinding>
    : B extends BindingsSpace.ALIAS
    ? NullableBinding<AliasBinding>
    : B extends BindingsSpace.MODULE
    ? NullableBinding<ModuleBinding>
    : B extends BindingsSpace.DATA_PROVIDER
    ? NullableBinding<DataProviderBinding>
    : B extends BindingsSpace.USER
    ? NullableBinding<UserBinding>
    : B extends BindingsSpace.OTHER
    ? NullableBinding<OtherBinding>
    : any;
