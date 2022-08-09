import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import type { Action } from '../../../src';
import { encodeActCall } from '../../../src';
import { BindingsSpace } from '../../../src/cas11/interpreter/BindingsManager';
import { AragonOS } from '../../../src/cas11/modules/aragonos/AragonOS';
import { CommandError } from '../../../src/errors';

import { toDecimals } from '../../../src/utils';

import { createInterpreter } from '../../test-helpers/cas11';
import { expectThrowAsync } from '../../test-helpers/expects';

export const commandsDescribe = (): Mocha.Suite =>
  describe('Commands', () => {
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    describe('when intepreting load command', () => {
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
        const error = new CommandError(
          'load',
          `module ${moduleName} not found`,
        );

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

    describe('when interpreting set command', () => {
      it('should set an user variable correctly', async () => {
        const interpreter = createInterpreter('set $var 1e18', signer);

        await interpreter.interpret();

        expect(interpreter.getBinding('$var', BindingsSpace.USER)).to.be.equal(
          toDecimals(1, 18),
        );
      });
    });

    describe('when interpreting exec command', () => {
      const target = '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735';
      const params = ['0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6', '1200e18'];
      const resolvedParams = [
        '0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6',
        toDecimals(1200, 18),
      ];
      const fnSig = 'approve(address,uint256)';
      it('should encode a call method correctly', async () => {
        const expectedCallAction: Action[] = [
          {
            to: target,
            data: encodeActCall(fnSig, resolvedParams),
          },
        ];

        const interpreter = createInterpreter(
          `exec ${target} "${fnSig}" ${params.join(' ')}`,
          signer,
        );

        const result = await interpreter.interpret();

        expect(result).eql(expectedCallAction);
      });

      // it('should fail when providing an invalid signature', async () => {
      //   const interpreter = createInterpreter(
      //     `exec ${target} "invalid(uint256," 1e18`,
      //   );

      // });
    });

    // describe('when interpreting all std commands', () => {
    //   it('asdsa', async () => {
    //     const interpreter = createInterpreter(`
    //       load aragonos as arOS

    //       set $holder1 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6
    //       set $amount1 3600e18

    //       exec 0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735 "approve(address,uint256)" $holder1 $amount1
    //      `);

    //     const res = await interpreter.interpret();
    //     console.log(res);
    //   });
    // });
  });
