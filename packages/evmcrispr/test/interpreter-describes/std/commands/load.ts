import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { AragonOS } from '../../../../src/cas11/modules/aragonos/AragonOS';

import { CommandError } from '../../../../src/errors';

import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const loadDescribe = (): Suite =>
  describe('when intepreting load command', () => {
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should load a module correctly', async () => {
      const moduleName = 'aragonos';
      const interpreter = createInterpreter(`load ${moduleName}`, signer);

      await interpreter.interpret();

      const modules = interpreter.getAllModules();
      const module = modules.find((m) => m.name === moduleName);

      expect(modules.length, 'total modules length mismatch').to.be.equal(2);
      expect(module, "module doesn't exists").to.exist;
      expect(module?.name, 'module name mismatch').to.equals(moduleName);
      expect(module, 'module class mismatch').instanceOf(AragonOS);
    });

    it('should set an alias for a module correctly', async () => {
      const interpreter = createInterpreter('load aragonos as ar', signer);

      await interpreter.interpret();

      const module = interpreter.getModule('aragonos');

      expect(module?.alias).to.be.equal('ar');
    });

    it('should fail when trying to load a non-existent module', async () => {
      const moduleName = 'nonExistent';
      const error = new CommandError('load', `module ${moduleName} not found`);

      await expectThrowAsync(
        () => createInterpreter(`load ${moduleName}`, signer).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when trying to load a previously loaded module', async () => {
      const moduleName = 'aragonos';
      const error = new CommandError(
        'load',
        `module ${moduleName} already loaded`,
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
        load ${moduleName}
        load ${moduleName}
      `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it(
      'should throw an error when trying to load a module with an alias previously used',
    );
  });
