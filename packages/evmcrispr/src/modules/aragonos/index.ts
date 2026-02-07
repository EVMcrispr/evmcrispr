import type { IModuleConstructor } from "../../types";
import { AragonOS } from "./AragonOS";

export { AragonDAO } from "./AragonDAO";
export { Connector } from "./Connector";

export type {
  App,
  AppCache,
  AppIdentifier,
  CallScriptAction,
  CompletePermission,
  Entity,
  LabeledAppIdentifier,
  Params,
  ParsedApp,
  Permission,
  PermissionMap,
  Repo,
  Role,
  RoleHash,
} from "./types";

export {
  and,
  arg,
  blockNumber,
  iif,
  not,
  or,
  oracle,
  paramValue,
  timestamp,
  xor,
} from "./utils/acl";
export { encodeActCall, encodeCallScript } from "./utils/evmscripts";

export const ModuleConstructor: IModuleConstructor = AragonOS;
export { commands } from "./commands";
export { helpers } from "./helpers";
