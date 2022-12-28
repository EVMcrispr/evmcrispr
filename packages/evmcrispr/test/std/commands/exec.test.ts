import {
  createInterpreter,
  expectThrowAsync,
  itChecksNonDefinedIdentifier,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import { CommandError } from '../../../src/errors';
import type { Action } from '../../../src/types';

import { toDecimals } from '../../../src/utils';
import { encodeActCall, findStdCommandNode } from '../utils';

const ETHERSCAN_API = process.env.ETHERSCAN_API;

describe('Std > commands > exec <target> <fnSignature> [<...params>] [--from <sender>]', () => {
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const target = '0x44fA8E6f47987339850636F88629646662444217'; // DAI
  const params = ['0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6', '1200e18'];
  const resolvedParams = [
    '0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6',
    toDecimals(1200, 18),
  ];
  const fnSig = 'approve(address,uint256)';

  it('should return a correct exec action', async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(' ')}`,
      signer,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data: encodeActCall(fnSig, resolvedParams),
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it('should return a correct exec action with value', async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(' ')} --value 1e18`,
      signer,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data: encodeActCall(fnSig, resolvedParams),
        value: '1000000000000000000',
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it('should return a correct exec action with from address', async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(' ')} --from ${target}`,
      signer,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data: encodeActCall(fnSig, resolvedParams),
        from: target,
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it('should return a correct exec action with value and from address', async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} ${params.join(
        ' ',
      )} --value 1e18 --from ${target}`,
      signer,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        to: target,
        data: encodeActCall(fnSig, resolvedParams),
        from: target,
        value: '1000000000000000000',
      },
    ];

    expect(result).eql(expectedCallAction);
  });

  it('should return a correct exec action when having to implicitly convert any string parameter to bytes when expecting one', async () => {
    const targetAddress = '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7';
    const params = [
      ['0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667'],
      'QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2',
    ];
    const interpreter = createInterpreter(
      `exec ${targetAddress} addBatches(bytes32[],bytes) [${params[0].toString()}] ${
        params[1]
      }`,
      signer,
    );
    const fnABI = new utils.Interface(['function addBatches(bytes32[],bytes)']);

    const actActions = await interpreter.interpret();

    const expectedActActions: Action[] = [
      {
        to: targetAddress,
        data: fnABI.encodeFunctionData('addBatches', [
          params[0],
          utils.hexlify(
            utils.toUtf8Bytes('QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2'),
          ),
        ]),
      },
    ];
    expect(actActions).to.be.eql(expectedActActions);
  });

  it("should return exec action when receiving just the method's name", async () => {
    const interpreter = createInterpreter(
      `
        set $std:etherscanAPI  ${ETHERSCAN_API}
        exec ${target} transfer @me 1500e18
        `,
      signer,
    );

    const callActions = await interpreter.interpret();

    const expectedCallActions: Action[] = [
      {
        to: '0xf8d1677c8a0c961938bf2f9adc3f3cfda759a9d9',
        data: encodeActCall('transfer(address,uint256)', [
          await signer.getAddress(),
          toDecimals(1500),
        ]),
      },
    ];

    expect(callActions).to.eql(expectedCallActions);
  });

  itChecksNonDefinedIdentifier(
    'should fail when receiving a non-defined target identifier',
    (nonDefinedIdentifier) =>
      createInterpreter(
        `
        exec ${nonDefinedIdentifier} "${fnSig}" 1e18
      `,
        signer,
      ),
    'exec',
    0,
  );

  it('should fail when receiving an invalid target address', async () => {
    const invalidTargetAddress = 'false';
    const interpreter = createInterpreter(
      `exec ${invalidTargetAddress} ${fnSig} 1e18`,
      signer,
    );
    const c = findStdCommandNode(interpreter.ast, 'exec')!;
    const error = new CommandError(
      c,
      `expected a valid target address, but got ${invalidTargetAddress}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when providing an invalid signature', async () => {
    const invalidSignature = 'invalid(uint256,)';
    const interpreter = createInterpreter(
      `
        set $std:etherscanAPI ${ETHERSCAN_API}
        exec ${target} ${invalidSignature} 1e18`,
      signer,
    );
    const c = findStdCommandNode(interpreter.ast, 'exec')!;
    const error = new CommandError(
      c,
      `error when getting function from ABI - no matching function (argument="signature", value="invalid(uint256,)", code=INVALID_ARGUMENT, version=abi/5.7.0)`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it(
    "should fail when providing a method's name whose contract ABI isn't found",
  );

  it("should fail when providing an ABI duplicated method's name");

  it(
    "should fail when providing a method's name of a contract which isn't verified",
  );

  it('should fail when providing invalid call params', async () => {
    const paramErrors = [
      '-param 0 of type address: invalid address. Got false',
    ];
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} false 1e18`,
      signer,
    );
    const c = findStdCommandNode(interpreter.ast, 'exec')!;
    const error = new CommandError(
      c,
      `error when encoding approve call:\n${paramErrors.join('\n')}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when providing invalid value parameter', async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} @me 1e18 --value tata`,
      signer,
    );
    const c = findStdCommandNode(interpreter.ast, 'exec')!;
    const error = new CommandError(c, `expected a valid value, but got tata`);

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when providing invalid from address', async () => {
    const interpreter = createInterpreter(
      `exec ${target} ${fnSig} @me 1e18 --from tata`,
      signer,
    );
    const c = findStdCommandNode(interpreter.ast, 'exec')!;
    const error = new CommandError(
      c,
      `expected a valid from address, but got tata`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
