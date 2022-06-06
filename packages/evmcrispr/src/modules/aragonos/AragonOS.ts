import type EVMcrispr from '../../EVMcrispr';
import type { ActionFunction, Permission, PermissionP } from '../../types';
import { connect } from './commands/connect';
import { act } from './commands/act';
import { grant } from './commands/grant';
import { install } from './commands/install';
import { newDao } from './commands/new-dao';
import { newToken } from './commands/new-token';
import { revoke } from './commands/revoke';
import { upgrade } from './commands/upgrade';
import type { AragonDAO } from './utils/AragonDAO';

export default class AragonOS {
  evm: EVMcrispr;
  dao: AragonDAO | null;

  constructor(evm: EVMcrispr) {
    this.evm = evm;
    this.dao = null;
  }

  connect(dao: string): ActionFunction {
    return connect(this, dao);
  }

  act(
    agent: string,
    target: string,
    signature: string,
    params: any[],
  ): ActionFunction {
    return act(this, agent, target, signature, params);
  }

  grant(
    permission: Permission | PermissionP,
    defaultPermissionManager: string,
  ): ActionFunction {
    return grant(this, permission, defaultPermissionManager);
  }

  install(identifier: string, initParams?: any[]): ActionFunction {
    return install(this, identifier, initParams);
  }

  newDao(name: string): ActionFunction {
    return newDao(this, name);
  }

  newToken(
    name: string,
    symbol: string,
    controller: string,
    decimals?: number,
    transferable?: boolean,
  ): ActionFunction {
    return newToken(this, name, symbol, controller, decimals, transferable);
  }

  revoke(permission: Permission, removeManager?: boolean): ActionFunction {
    return revoke(this, permission, removeManager);
  }

  upgrade(apmRepo: string, newAppAddress: string): ActionFunction {
    return upgrade(this, apmRepo, newAppAddress);
  }
}
