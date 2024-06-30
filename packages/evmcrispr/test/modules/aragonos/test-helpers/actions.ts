import { isAddress, parseAbi, toHex } from "viem";

import type { Action, Address, TransactionAction } from "../../../../src/types";
import {
  CONTEXT_FORWARDER_TYPE,
  FORWARDER_TYPE,
  getAppForwarderType,
} from "./forwarders";
import { encodeCallScript } from "../../../../src/modules/aragonos/utils";
import { encodeAction } from "../../../../src/utils";

export const createTestPreTxAction = (
  operation: string,
  to: Address,
  parameters: any[],
): Action => {
  switch (operation) {
    case "approve":
      return encodeAction(to, "approve(address,uint256)", parameters);
    default:
      throw new Error(`Pretransaction operation ${operation} not found.`);
  }
};

export const createTestAction = (
  operation:
    | "changeController"
    | "createCloneToken"
    | "createPermission"
    | "grantPermission"
    | "grantPermissionP"
    | "newInstance"
    | "newAppInstance"
    | "revokePermission"
    | "removePermissionManager"
    | "setApp",
  to: Address,
  parameters?: any[],
): TransactionAction => {
  const abi = parseAbi([
    "function changeController(address)",
    "function createCloneToken(address,uint256,string,uint8,string,bool)",
    "function createPermission(address,address,bytes32,address)",
    "function grantPermission(address,address,bytes32)",
    "function grantPermissionP(address,address,bytes32,uint256[])",
    "function newInstance()",
    "function newAppInstance(bytes32,address,bytes,bool)",
    "function revokePermission(address,address,bytes32)",
    "function removePermissionManager(address,bytes32)",
    "function setApp(bytes32,bytes32,address)",
  ]);

  return encodeAction(to, operation, parameters || [], { abi });
};

export const createTestScriptEncodedAction = (
  forwarderActions: TransactionAction[],
  path: string[],
  dao: Record<string, Address>,
  context?: string,
): TransactionAction => {
  let script: string;
  const forwardingPath = [...path].reverse();
  for (const forwarder of forwardingPath) {
    script = encodeCallScript(forwarderActions);
    const forwarderType = getAppForwarderType(forwarder);
    const forwarderAddress = isAddress(forwarder) ? forwarder : dao[forwarder];

    switch (forwarderType) {
      case FORWARDER_TYPE:
        forwarderActions = [
          encodeAction(forwarderAddress, "forward(bytes)", [script]),
        ];
        break;
      case CONTEXT_FORWARDER_TYPE:
        if (!context) {
          throw new Error("Context not provided.");
        }
        forwarderActions = [
          encodeAction(forwarderAddress, "forward(bytes,bytes)", [
            script,
            toHex(context),
          ]),
        ];
        break;
      default:
        throw new Error(`Type ${forwarderType} not found.`);
    }
  }

  return forwarderActions[0];
};
