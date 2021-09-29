import { utils } from "ethers";
import { DAO } from ".";
import { Permission } from "../../src";

export const resolvePermission = (permission: Permission): Permission => {
  return permission.map((element, index) => {
    // Last element is the role
    if (index === permission.length - 1) {
      return utils.id(element);
    }

    return utils.isAddress(element) ? element : DAO[element as keyof typeof DAO];
  }) as Permission;
};

export const resolveApp = (appName: string): string => {
  return DAO[appName as keyof typeof DAO];
};

export const getSignatureSelector = (signature: string): string => {
  return signature.split("(")[0];
};
