import { utils } from 'ethers';

import type { Action, Address } from '../../src/types';
import { encodeActCall, encodeCallScript } from '../../src/helpers';
import {
  CONTEXT_FORWARDER_TYPE,
  FORWARDER_TYPE,
  getAppForwarderType,
} from './forwarders';
import { resolveApp } from '../fixtures';

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
  operation: string,
  to: Address,
  parameters: any[],
): Action => {
  switch (operation) {
    case 'createPermission':
      return {
        to,
        data: encodeActCall(
          'createPermission(address,address,bytes32,address)',
          parameters,
        ),
      };
    case 'grantPermission':
      return {
        to,
        data: encodeActCall(
          'grantPermission(address,address,bytes32)',
          parameters,
        ),
      };
    case 'newAppInstance':
      return {
        to,
        data: encodeActCall(
          'newAppInstance(bytes32,address,bytes,bool)',
          parameters,
        ),
      };
    case 'revokePermission':
      return {
        to,
        data: encodeActCall(
          'revokePermission(address,address,bytes32)',
          parameters,
        ),
      };
    case 'removePermissionManager':
      return {
        to,
        data: encodeActCall(
          'removePermissionManager(address,bytes32)',
          parameters,
        ),
      };
    default:
      throw new Error(`Operation ${operation} unknown.`);
  }
};

export const createTestScriptEncodedAction = (
  forwarderActions: Action[],
  path: string[],
  context?: string,
): Action => {
  let script: string;
  const forwardingPath = [...path].reverse();
  for (const forwarder of forwardingPath) {
    script = encodeCallScript(forwarderActions);
    const forwarderType = getAppForwarderType(forwarder);
    const forwarderAddress = resolveApp(forwarder);

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

  return { ...forwarderActions[0], value: 0 };
};
