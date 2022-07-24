import type { NodeResolver } from '../interpreter/Interpreter';
import type { BindingsManager } from '../interpreter/BindingsManager';
import type { Action } from '../..';

export abstract class Module {
  name: string;
  alias?: string;

  protected bindingsManager: BindingsManager;

  constructor(name: string, bindingsManager: BindingsManager, alias?: string) {
    this.name = name;
    this.alias = alias;
    this.bindingsManager = bindingsManager;
  }

  abstract hasCommand(commandName: string): boolean;

  abstract interpretCommand(
    name: string,
    argNodeResolvers: NodeResolver[],
  ): Promise<Action | void>;

  protected panic(msg: string): void {
    throw new Error(msg);
  }
}
