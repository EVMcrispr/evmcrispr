import { ModuleConstructor as AragonOS } from '@1hive/evmcrispr-aragonos-module';
import {
  createInterpreter,
  expectThrowAsync,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { CommandError } from '../../../src/errors';
import type { CommandExpressionNode } from '../../../src/types';
import { findStdCommandNode } from '../utils';

describe('Std > commands > load <name> [as <alias>]', () => {
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
    const interpreter = createInterpreter(`load ${moduleName}`, signer);
    const c = findStdCommandNode(interpreter.ast, 'load')!;
    const error = new CommandError(c, `module ${moduleName} not found`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when trying to load a previously loaded module', async () => {
    const moduleName = 'aragonos';
    const interpreter = createInterpreter(
      `
    load ${moduleName}
    load ${moduleName}
  `,
      signer,
    );
    const c = interpreter.ast.body[1] as CommandExpressionNode;
    const error = new CommandError(c, `module ${moduleName} already loaded`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it(
    'should throw an error when trying to load a module with an alias previously used',
  );
});
