import {
  aragonosModuleDescribe,
  literalDescribe,
  stdModuleDescribe,
} from './interpreter-describes/';

describe('CAS11 Interpreter', () => {
  literalDescribe();

  describe('Modules', () => {
    stdModuleDescribe();

    aragonosModuleDescribe();
  });
});
