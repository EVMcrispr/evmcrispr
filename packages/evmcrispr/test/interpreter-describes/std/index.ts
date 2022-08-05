import { commandsDescribe } from './commands';
import { helpersDescribe } from './helpers';

export const stdModuleDescribe = (): Mocha.Suite =>
  describe.only('Std', () => {
    commandsDescribe();
    helpersDescribe();
  });
