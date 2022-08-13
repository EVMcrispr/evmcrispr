import { aragonEnsDescribe } from './aragonEns';

export const helpersDescribe = (): Mocha.Suite =>
  describe('Helpers', () => {
    aragonEnsDescribe();
  });
