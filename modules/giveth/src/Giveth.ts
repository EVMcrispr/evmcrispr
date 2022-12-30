import type {
  BindingsManager,
  EVMcrispr,
  IPFSResolver,
} from '@1hive/evmcrispr';
import { Module } from '@1hive/evmcrispr';

import { commands } from './commands';
import { helpers } from './helpers';

export class Giveth extends Module {
  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super(
      'giveth',
      bindingsManager,
      nonces,
      commands,
      helpers,
      evmcrispr,
      ipfsResolver,
      alias,
    );
  }
}
