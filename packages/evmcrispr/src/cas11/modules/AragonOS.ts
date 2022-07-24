import type { NodeResolver } from '../interpreter/Interpreter';
import type { BindingsManager } from '../interpreter/BindingsManager';

import { Module } from './Module';

export class AragonOS extends Module {
  constructor(bindingsManager: BindingsManager, alias?: string) {
    super('aragonos', bindingsManager, alias);
    // TODO: set up connector
  }

  hasCommand(commandName: string): boolean {
    return commandName === 'connect';
  }
  async interpretCommand(
    name: string,
    argNodeResolvers: NodeResolver[],
  ): Promise<any> {
    if (!this.hasCommand(name)) {
      return Promise.resolve(null);
    }

    // TODO: refactor to dynamic import and implement remaining commands
    switch (name) {
      case 'connect': {
        const [daoIdentifierResolver, daoCommandsBlockResolver] =
          argNodeResolvers;
        this.#connect(await daoIdentifierResolver(), daoCommandsBlockResolver);
        return Promise.resolve();
      }
      default:
        return Promise.resolve();
    }
  }

  #connect(dao: string, commandsBlockResolver: NodeResolver): void {
    // TODO: resolve dao in case it's a name.
    const daoAddress = dao;
    commandsBlockResolver(this.#setDAOContext(daoAddress));
  }

  #setDAOContext(daoAddress: string): () => any {
    return () => {
      console.log(daoAddress);
      this.#setIdentifiers();
      // TODO: fetch DAO data from connector
    };
  }

  #setIdentifiers(): void {
    this.bindingsManager.setBinding('ANY_ENTITY', '');
    this.bindingsManager.setBinding('NO_ENTITY', '');
    this.bindingsManager.setBinding('BURN_ENTITY', '');
  }
}
