import type { Action, Address, TransactionAction } from '@1hive/evmcrispr';
import { utils } from 'ethers';

import { encodeActCall, encodeCallScript } from '../../src/utils';
import {
  CONTEXT_FORWARDER_TYPE,
  FORWARDER_TYPE,
  getAppForwarderType,
} from './forwarders';

export const createTestPreTxAction = (
  operation: string,
  to: Address,
  parameters: any[],
): Action => {
  switch (operation) {
    case 'approve':
      return {
        to,
        data: encodeActCall('approve(address,uint256)', parameters),
      };
    default:
      throw new Error(`Pretransaction operation ${operation} not found.`);
  }
};

export const createTestCallAction = (
  appAddress: Address,
  functionSignature: string,
  parameters: any[],
): Action => {
  return {
    to: appAddress,
    data: encodeActCall(functionSignature, parameters),
  };
};

export const createTestAction = (
  operation:
    | 'changeController'
    | 'createCloneToken'
    | 'createPermission'
    | 'grantPermission'
    | 'grantPermissionP'
    | 'newInstance'
    | 'newAppInstance'
    | 'revokePermission'
    | 'removePermissionManager'
    | 'setApp',
  to: Address,
  parameters?: any[],
): TransactionAction => {
  const multiFnsInterface = new utils.Interface([
    'function changeController(address)',
    'function createCloneToken(address,uint256,string,uint8,string,bool)',
    'function createPermission(address,address,bytes32,address)',
    'function grantPermission(address,address,bytes32)',
    'function grantPermissionP(address,address,bytes32,uint256[])',
    'function newInstance()',
    'function newAppInstance(bytes32,address,bytes,bool)',
    'function revokePermission(address,address,bytes32)',
    'function removePermissionManager(address,bytes32)',
    'function setApp(bytes32,bytes32,address)',
  ]);

  return {
    to,
    data: multiFnsInterface.encodeFunctionData(operation, parameters),
  };
};

export const createTestScriptEncodedAction = (
  forwarderActions: TransactionAction[],
  path: string[],
  dao: Record<string, string>,
  context?: string,
): TransactionAction => {
  let script: string;
  const forwardingPath = [...path].reverse();
  for (const forwarder of forwardingPath) {
    script = encodeCallScript(forwarderActions);
    const forwarderType = getAppForwarderType(forwarder);
    const forwarderAddress = utils.isAddress(forwarder)
      ? forwarder
      : dao[forwarder];

    switch (forwarderType) {
      case FORWARDER_TYPE:
        forwarderActions = [
          {
            to: forwarderAddress,
            data: encodeActCall('forward(bytes)', [script]),
          },
        ];
        break;
      case CONTEXT_FORWARDER_TYPE:
        if (!context) {
          throw new Error('Context not provided.');
        }
        forwarderActions = [
          {
            to: forwarderAddress,
            data: encodeActCall('forward(bytes,bytes)', [
              script,
              utils.hexlify(utils.toUtf8Bytes(context)),
            ]),
          },
        ];
        break;
      default:
        throw new Error(`Type ${forwarderType} not found.`);
    }
  }

  return forwarderActions[0];
};
