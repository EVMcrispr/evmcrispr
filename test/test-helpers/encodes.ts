import { Action } from "../../src";
import { encodeActCall } from "../../src/helpers";
import { DAO, resolveApp } from "./mock-data";

export const CONTEXT_FORWARDER = "FORWARDER_WITH_CONTEXT";
export const FORWARDER = "FORWARDER";
export const FEE_FORWARDER = "FEE_FORWARDER";

const forwarderApps = ["voting", "token-manager", "tollgate"];
const forwarderWithContextApps = ["disputable-voting"];
const feeForwarderApps = ["tollgate"];

export const getAppForwarderType = (appName: string): string => {
  if (forwarderApps.includes(appName)) {
    return FORWARDER;
  } else if (forwarderWithContextApps.includes(appName)) {
    return CONTEXT_FORWARDER;
  } else if (feeForwarderApps.includes(appName)) {
    return FEE_FORWARDER;
  } else {
    return "";
  }
};

export const createForwarderAction = (forwarderType: string, forwarderName: string, parameters: any[]): Action => {
  const forwarderAddress = resolveApp(forwarderName);
  switch (forwarderType) {
    case FORWARDER:
      return {
        to: forwarderAddress,
        data: encodeActCall("forward(bytes)", parameters),
      };
    case CONTEXT_FORWARDER:
      return {
        to: forwarderAddress,
        data: encodeActCall("forward(bytes,bytes)", parameters),
      };
    default:
      throw new Error(`Type ${forwarderType} not found.`);
  }
};

export const createTestAction = (operation: string, parameters: any[]): Action => {
  switch (operation) {
    case "addPermission":
      return {
        to: DAO.acl,
        data: encodeActCall("createPermission(address,address,bytes32,address)", parameters),
      };
    case "grantPermission":
      return {
        to: DAO.acl,
        data: encodeActCall("grantPermission(address,address,bytes32)", parameters),
      };
    case "installNewApp":
      return {
        to: DAO.kernel,
        data: encodeActCall("newAppInstance(bytes32,address,bytes,bool)", parameters),
      };
    case "revokePermission":
      return {
        to: DAO.acl,
        data: encodeActCall("revokePermission(address,address,bytes32)", parameters),
      };
    default:
      throw new Error(`Operation ${operation} unknown.`);
  }
};
