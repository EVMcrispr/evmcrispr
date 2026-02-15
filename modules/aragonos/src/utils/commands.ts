import type {
  Address,
  BindingsManager,
  CommandExpressionNode,
  Node,
  NodeInterpreter,
} from "@evmcrispr/sdk";
import {
  BindingsSpace,
  ErrorException,
  getOptValue,
  listItems,
  NodeType,
} from "@evmcrispr/sdk";
import { isAddress } from "viem";
import type { AragonDAO } from "../AragonDAO";
import type { App, CompletePermission, PermissionMap, Role } from "../types";
import {
  optionalLabeledAppIdentifierRegex,
  parsePrefixedDAOIdentifier,
} from "./identifiers";
import { normalizeRole } from "./normalizers";

const { DATA_PROVIDER } = BindingsSpace;

export const DAO_OPT_NAME = "dao";

export const parseDaoPrefixedIdentifier = (
  identifier: string,
): [string | undefined, string] | undefined => {
  const [daoName, rest] = parsePrefixedDAOIdentifier(identifier);
  if (!optionalLabeledAppIdentifierRegex.test(rest)) {
    return undefined;
  }
  return [daoName, rest];
};

export const getDAO = (
  bindingsManager: BindingsManager,
  appNode: Node,
): AragonDAO => {
  let dao = bindingsManager.getBindingValue("currentDAO", DATA_PROVIDER) as
    | AragonDAO
    | undefined;

  if (appNode.type === NodeType.Bareword) {
    const res = parseDaoPrefixedIdentifier(appNode.value);

    if (res?.[0]) {
      const [daoIdentifier] = res;

      dao = bindingsManager.getBindingValue(daoIdentifier, DATA_PROVIDER) as
        | AragonDAO
        | undefined;
      if (!dao) {
        throw new ErrorException(
          `couldn't found a DAO for ${daoIdentifier} on given identifier ${appNode.value}`,
        );
      }
    }
  }

  if (!dao) {
    throw new ErrorException('must be used within a "connect" command');
  }

  return dao;
};

export const getDAOByOption = async (
  c: CommandExpressionNode,
  bindingsManager: BindingsManager,
  interpretNode: NodeInterpreter,
): Promise<AragonDAO> => {
  let daoIdentifier = await getOptValue(c, "dao", interpretNode);

  let dao: AragonDAO | undefined;

  if (!daoIdentifier) {
    dao = bindingsManager.getBindingValue(
      "currentDAO",
      DATA_PROVIDER,
    ) as AragonDAO;
    if (!dao) {
      throw new ErrorException(`must be used within a "connect" command`);
    }
  } else {
    daoIdentifier = daoIdentifier.toString
      ? daoIdentifier.toString()
      : daoIdentifier;
    dao = bindingsManager.getBindingValue(daoIdentifier, DATA_PROVIDER) as
      | AragonDAO
      | undefined;
    if (!dao) {
      throw new ErrorException(
        `--dao option error. No DAO found for identifier ${daoIdentifier}`,
      );
    }
  }

  return dao;
};

export interface PermissionContext {
  app: App;
  roleHash: string;
  appPermissions: PermissionMap;
  appPermission: Role;
  aclAddress: Address;
}

/**
 * Resolves and validates a permission's context from the DAO.
 * Shared between grant and revoke commands.
 */
export const resolvePermissionContext = (
  dao: AragonDAO,
  appAddress: Address,
  role: string,
): PermissionContext => {
  const app = dao.resolveApp(appAddress);

  if (!app) {
    throw new ErrorException(`${appAddress} is not a DAO's app`);
  }

  const roleHash = normalizeRole(role);
  const { permissions: appPermissions, name } = app;
  const { address: aclAddress } = dao.resolveApp("acl")!;

  if (!appPermissions.has(roleHash)) {
    throw new ErrorException(`given permission doesn't exists on app ${name}`);
  }

  const appPermission = appPermissions.get(roleHash)!;

  return { app, roleHash, appPermissions, appPermission, aclAddress };
};

export const isPermission = (p: any[]): p is CompletePermission | never => {
  const errors: string[] = [];
  const [granteeAddress, appAddress, role, managerAddress] = p;

  if (!isAddress(granteeAddress)) {
    errors.push(`<grantee> must be a valid address, got ${granteeAddress}`);
  }

  if (!isAddress(appAddress)) {
    errors.push(`<app> must be a valid address, got ${appAddress}`);
  }

  if (role.startsWith("0x")) {
    if (role.length !== 66) {
      errors.push(`<role> must be a valid hash, got ${role}`);
    }
  }

  if (managerAddress && !isAddress(managerAddress)) {
    errors.push(
      `<permissionManager> must be a valid address, got ${managerAddress}`,
    );
  }

  if (errors.length) {
    throw new ErrorException(listItems("invalid permission provided", errors));
  }

  return true;
};
