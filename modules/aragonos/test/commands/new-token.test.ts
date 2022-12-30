import type { TransactionAction } from '@1hive/evmcrispr';
import {
  BindingsSpace,
  CommandError,
  addressesEqual,
  buildNonceForAddress,
  calculateNewProxyAddress,
} from '@1hive/evmcrispr';
import {
  DAO,
  DAO2,
  createInterpreter,
  expectThrowAsync,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

import type { AragonOS } from '../../src/AragonOS';

import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from '../utils';

describe('AragonOS > commands > new-token <name> <symbol> <controller> [decimals = 18] [transferable = true]', () => {
  let signer: Signer;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  before(async () => {
    [signer] = await ethers.getSigners();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      signer,
      DAO.kernel,
    );
  });

  it('should return a correct new token action', async () => {
    const params = ['my-token', 'MT', 'token-manager.open:counter-factual-tm'];

    const interpreter = await createAragonScriptInterpreter([
      `new-token ${params.join(' ')}`,
      `set $token token:MT`,
      `set $controller token-manager.open:counter-factual-tm`,
    ]);

    const newTokenActions = await interpreter.interpret();

    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const tx1 = await signer.sendTransaction(
      newTokenActions[0] as TransactionAction,
    );

    await tx1.wait();

    const tx2 = await signer.sendTransaction(
      newTokenActions[1] as TransactionAction,
    );

    await tx2.wait();

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )!;

    const tokenManagerAddr = aragonos.bindingsManager.getBindingValue(
      `$controller`,
      BindingsSpace.USER,
    )!;

    const token = new Contract(
      tokenAddr,
      ['function controller() view returns (address)'],
      signer,
    );

    expect(addressesEqual(await token.controller(), tokenManagerAddr)).to.be
      .true;
  });

  it('should return a correct new token action given a different DAO', async () => {
    const params = [
      'my-token',
      'MT',
      `_${DAO.kernel}:token-manager.open:counter-factual-tm`,
    ];

    const interpreter = createInterpreter(
      `
        load aragonos as ar

        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            new-token ${params.join(' ')}
            set $token token:MT
            set $controller _${DAO.kernel}:token-manager.open:counter-factual-tm
          )
        )
      `,
      signer,
    );

    const newTokenActions = await interpreter.interpret();

    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const tx1 = await signer.sendTransaction(
      newTokenActions[0] as TransactionAction,
    );

    await tx1.wait();

    const tx2 = await signer.sendTransaction(
      newTokenActions[1] as TransactionAction,
    );

    await tx2.wait();

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )!;

    const tokenManagerAddr = aragonos.bindingsManager.getBindingValue(
      `$controller`,
      BindingsSpace.USER,
    )!;

    const token = new Contract(
      tokenAddr,
      ['function controller() view returns (address)'],
      signer,
    );
    const addr = calculateNewProxyAddress(
      DAO.kernel,
      await buildNonceForAddress(DAO.kernel, 0, signer.provider!),
    );

    expect(addressesEqual(addr, tokenManagerAddr)).to.be.true;
    expect(addressesEqual(await token.controller(), tokenManagerAddr)).to.be
      .true;
  });

  it('should return a correct new token action when it is not connected to a DAO', async () => {
    const params = [
      'my-token',
      'MT',
      `0xf762d8c9ea241a72a0b322a28e96155a03566acd`,
    ];

    const interpreter = createInterpreter(
      `
        load aragonos as ar
        ar:new-token ${params.join(' ')}
        set $token token:MT
      `,
      signer,
    );

    const newTokenActions = await interpreter.interpret();

    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const tx1 = await signer.sendTransaction(
      newTokenActions[0] as TransactionAction,
    );

    await tx1.wait();

    const tx2 = await signer.sendTransaction(
      newTokenActions[1] as TransactionAction,
    );

    await tx2.wait();

    const tokenAddr = aragonos.bindingsManager.getBindingValue(
      `$token`,
      BindingsSpace.USER,
    )!;

    const token = new Contract(
      tokenAddr,
      ['function controller() view returns (address)'],
      signer,
    );

    expect(addressesEqual(await token.controller(), params[2])).to.be.true;
  });

  it('should fail when executing it using a conterfactual app outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
      load aragonos as ar

      ar:new-token "a new token" ANT token-manager.open:counter-factual-tm
    `,
      signer,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      'invalid controller. Expected a labeled app identifier witin a connect command for token-manager.open:counter-factual-tm',
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when passing an invalid token decimals value', async () => {
    const invalidDecimals = 'invalidDecimals';
    const interpreter = createAragonScriptInterpreter([
      `new-token "a new token" ANT token-manager.open:counter-factual-tm ${invalidDecimals}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'new-token')!;
    const error = new CommandError(
      c,
      `invalid decimals. Expected an integer number, but got ${invalidDecimals}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when passing an invalid controller', async () => {
    const invalidController = 'asd:123-asd&45';
    const interpreter = createAragonScriptInterpreter([
      `new-token "a new token" ANT ${invalidController}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'new-token')!;
    const error = new CommandError(
      c,
      `invalid controller. Expected an address or an app identifier, but got ${invalidController}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when passing an invalid transferable flag', async () => {
    const invalidTransferable = 'an-invalid-value';
    const interpreter = createAragonScriptInterpreter([
      `new-token "a new token" ANT token-manager.open:counter-factual-tm 18 ${invalidTransferable}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'new-token')!;
    const error = new CommandError(
      c,
      `invalid transferable flag. Expected a boolean, but got ${invalidTransferable}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
