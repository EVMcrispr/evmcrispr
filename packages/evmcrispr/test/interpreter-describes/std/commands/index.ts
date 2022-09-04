import { execDescribe } from './exec';
import { loadDescribe } from './load';
import { setDescribe } from './set';

export const commandsDescribe = (): Mocha.Suite =>
  describe('Commands', () => {
    loadDescribe();

    execDescribe();

    setDescribe();
  });
