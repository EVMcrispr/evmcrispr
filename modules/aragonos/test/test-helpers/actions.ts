import {
  type CallScriptAction,
  encodeCallScript,
} from "@evmcrispr/module-aragonos/utils";
import {
  type Address,
  encodeAction,
  type TransactionAction,
} from "@evmcrispr/sdk";
import { isAddress, parseAbi, toHex } from "viem";
import {
  CONTEXT_FORWARDER_TYPE,
  FORWARDER_TYPE,
  getAppForwarderType,
} from "./forwarders";

export const createTestPreTxAction = (
  operation: string,
  to: Address,
  parameters: any[],
): CallScriptAction => {
  switch (operation) {
    case "approve":
      return toCallScriptAction(encodeAction(to, "approve(address,uint256)", parameters));
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
): CallScriptAction => {
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

  return toCallScriptAction(encodeAction(to, operation, parameters || [], { abi }));
};

export const createTestScriptEncodedAction = (
  forwarderActions: CallScriptAction[],
  path: string[],
  dao: Record<string, Address>,
  context?: string,
): CallScriptAction => {
  let script: string;
  const forwardingPath = [...path].reverse();
  for (const forwarder of forwardingPath) {
    script = encodeCallScript(forwarderActions);
    const forwarderType = getAppForwarderType(forwarder);
    const forwarderAddress = isAddress(forwarder) ? forwarder : dao[forwarder];

    switch (forwarderType) {
      case FORWARDER_TYPE:
        {
          const action = encodeAction(forwarderAddress, "forward(bytes)", [script]);
          forwarderActions = [toCallScriptAction(action)];
        }
        break;
      case CONTEXT_FORWARDER_TYPE:
        if (!context) {
          throw new Error("Context not provided.");
        }
        {
          const action = encodeAction(forwarderAddress, "forward(bytes,bytes)", [
            script,
            toHex(context),
          ]);
          forwarderActions = [toCallScriptAction(action)];
        }
        break;
      default:
        throw new Error(`Type ${forwarderType} not found.`);
    }
  }

  return forwarderActions[0];
};

export function toCallScriptAction(action: TransactionAction): CallScriptAction {
  if (!action.data) {
    throw new Error("Missing calldata for call script action.");
  }
  return { to: action.to, data: action.data };
}
