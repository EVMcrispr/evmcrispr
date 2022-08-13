import {
  aragonosModuleDescribe,
  literalDescribe,
  stdModuleDescribe,
} from './interpreter-describes/';

describe.only('CAS11 Interpreter', () => {
  literalDescribe();

  describe('Modules', () => {
    stdModuleDescribe();

    aragonosModuleDescribe();
  });
});
