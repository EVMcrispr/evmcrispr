import type { IModuleConstructor } from '@1hive/evmcrispr';

import { AragonOS } from './AragonOS';
export { AragonDAO } from './AragonDAO';
export { Connector } from './Connector';

export type {
  App,
  AppCache,
  AppIdentifier,
  CallScriptAction,
  CompletePermission,
  Entity,
  LabeledAppIdentifier,
  ParsedApp,
  Params,
  Permission,
  PermissionMap,
  Repo,
  Role,
  RoleHash,
} from './types';

export {
  arg,
  blockNumber,
  timestamp,
  oracle,
  not,
  and,
  or,
  xor,
  iif,
  paramValue,
} from './utils/acl';
export { encodeActCall, encodeCallScript } from './utils/evmscripts';

export const ModuleConstructor: IModuleConstructor = AragonOS;
export { commands } from './commands';
export { helpers } from './helpers';
