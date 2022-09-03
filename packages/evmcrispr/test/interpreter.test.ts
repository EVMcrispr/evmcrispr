import {
  aragonosModuleDescribe,
  arithmeticDescribe,
  literalDescribe,
  stdModuleDescribe,
} from './interpreter-describes/';

describe.only('CAS11 Interpreter', () => {
  arithmeticDescribe();

  literalDescribe();

  describe('Modules', () => {
    stdModuleDescribe();

    aragonosModuleDescribe();
  });
});
