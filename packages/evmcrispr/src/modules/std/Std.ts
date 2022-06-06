import type { ActionFunction, EVMcrispr, Entity } from '../..';
import { exec } from './commands/exec';

export default class Std {
  evm: EVMcrispr;
  constructor(evm: EVMcrispr) {
    this.evm = evm;
  }
  exec(target: Entity, method: string, params: any[]): ActionFunction {
    return exec(this, target, method, params);
  }
}
