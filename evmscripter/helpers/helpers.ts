import { ethers } from "hardhat";
import { Action, AppIdentifier, LabeledAppIdentifier } from "../types";

export const SEPARATOR = ":";
export const ZERO_ADDRESS = "0x" + "0".repeat(40); // 0x0000...0000
export const TX_GAS_LIMIT = 10000000;
export const TX_GAS_PRICE = 10000000000;

export const normalizeRole = (role: string): string => {
  return role.startsWith("0x") && role.length === 64 ? role : ethers.utils.keccak256(role);
};

export const flatActions = (actions): Action[] => {
  return actions.reduce((flattenActions: Action[], action: Action | Action[]) => {
    if (Array.isArray(action)) {
      return [...flattenActions, ...action];
    }
    flattenActions.push(action);
    return flattenActions;
  }, []);
};

export const isAppIdentifier = (identifier: string): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[0-9]{1,63}(?<!-))?$");

  return regex.test(identifier);
};

export const isLabeledAppIdentifier = (identifier: string): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[A-Za-z-]{1,63}(?<!-))?$");

  return regex.test(identifier);
};

export const parseAppIdentifier = (appIdentifier: AppIdentifier): AppIdentifier | null => {
  if (!isAppIdentifier(appIdentifier)) {
    return null;
  }
  const [appName, appLabel] = appIdentifier.split(SEPARATOR);

  if (!appLabel) {
    return `${appName}:0`;
  }

  return appIdentifier;
};

export const parseLabeledIdentifier = (labeledAppIdentifier: AppIdentifier | LabeledAppIdentifier): string | null => {
  if (!isLabeledAppIdentifier(labeledAppIdentifier)) {
    return null;
  }

  return labeledAppIdentifier;
};

export const prepareAppRoles = (appCurrentPermissions, artifact) => {
  const appPermissions = artifact.roles.reduce((permissionsMap, role) => {
    permissionsMap.set(role.bytes, { manager: null, grantees: new Map() });
    return permissionsMap;
  }, new Map());

  appCurrentPermissions.forEach((currentPermission) => {
    if (appPermissions.has(currentPermission.roleHash)) {
      const permission = appPermissions.get(currentPermission.roleHash);
      permission.manager = currentPermission.manager;
      currentPermission.grantees.forEach(({ granteeAddress }) => {
        permission.grantees.set(granteeAddress, true);
      });
    }
  });

  return appPermissions;
};
