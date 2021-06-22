import { ethers } from "hardhat";
import { AppIdentifier, LabeledAppIdentifier } from "../types";
import { ErrorInvalidIdentifier } from "../errors";

export const SEPARATOR = ":";

export const ZERO_ADDRESS = "0x" + "0".repeat(40); // 0x0000...0000

export const TX_GAS_LIMIT = 10000000;

export const TX_GAS_PRICE = 10000000000;

export const normalizeRole = (role: string): string => {
  return role.startsWith("0x") && role.length === 64 ? role : ethers.utils.keccak256(role);
};

export const parseAppIdentifier = (appIdentifier: AppIdentifier) => {
  if (!isAppIdentifier(appIdentifier)) {
    throw new ErrorInvalidIdentifier(appIdentifier);
  }
  const [appName, label] = appIdentifier.split(SEPARATOR);

  if (!label) {
    return `${appName}:0`;
  }

  return appIdentifier;
};

export const isAppIdentifier = (appIdentifier: AppIdentifier): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[A-Za-z0-9-]{1,63}(?<!-))?$");

  return regex.test(appIdentifier);
};

export const isLabeledAppIdentifier = (labeledAppIdentifier: LabeledAppIdentifier): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[A-Za-z-]{1,63}(?<!-))?$");

  return regex.test(labeledAppIdentifier);
};
