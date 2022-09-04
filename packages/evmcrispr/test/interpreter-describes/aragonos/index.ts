import { commandsDescribe } from './commands';
import { helpersDescribe } from './helpers';

export const aragonosModuleDescribe = (): Mocha.Suite =>
  describe('AragonOS', () => {
    commandsDescribe();

    helpersDescribe();
  });
