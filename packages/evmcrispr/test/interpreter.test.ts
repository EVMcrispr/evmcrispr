import {
  aragonosModuleDescribe,
  arithmeticDescribe,
  literalDescribe,
  stdModuleDescribe,
} from './interpreter-describes/';

describe('CAS11 Interpreter', () => {
  arithmeticDescribe();

  literalDescribe();

  describe('Modules', () => {
    stdModuleDescribe();

    aragonosModuleDescribe();
  });
});
