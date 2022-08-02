import { commandsDescribe } from './commands';
import { helpersDescribe } from './helpers';

export const stdModuleDescribe = (): Mocha.Suite =>
  describe('Std Module', () => {
    commandsDescribe();
    helpersDescribe();
  });
