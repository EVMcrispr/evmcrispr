import type { ActionFunction, EVMcrispr, Entity } from '../..';
import type { Helper } from '../../types';
import { exec } from './commands/exec';
import helpers from './helpers';

export default class Std {
  evm: EVMcrispr;
  #helpers: { [name: string]: Helper };

  constructor(evm: EVMcrispr) {
    this.evm = evm;
    this.#helpers = helpers(evm);
  }
  get helpers() {
    return this.#helpers;
  }
  exec(target: Entity, method: string, params: any[]): ActionFunction {
    return exec(this, target, method, params);
  }
}
