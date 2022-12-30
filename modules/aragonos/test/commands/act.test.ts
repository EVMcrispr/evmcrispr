import { CommandError } from '@1hive/evmcrispr';
import {
  DAO,
  expectThrowAsync,
  itChecksNonDefinedIdentifier,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import {
  createAragonScriptInterpreter as _createAragonScriptInterpreter,
  createTestScriptEncodedAction,
  findAragonOSCommandNode,
} from '../utils';

describe('AragonOS > commands > act <agent> <targetAddress> <methodSignature> [...params]', () => {
  let signer: Signer;

  let createAragonScriptInterpreter: ReturnType<
    typeof _createAragonScriptInterpreter
  >;

  before(async () => {
    [signer] = await ethers.getSigners();

    createAragonScriptInterpreter = _createAragonScriptInterpreter(
      signer,
      DAO.kernel,
    );
  });

  it('should return a correct act action', async () => {
    const interpreter = createAragonScriptInterpreter([
      `act agent:1 agent:2 "deposit(uint256,uint256[][])" 1 [[2,3],[4,5]]`,
    ]);

    const actActions = await interpreter.interpret();

    const fnABI = new utils.Interface([
      'function deposit(uint256,uint256[][])',
    ]);

    const expectedActActions = [
      createTestScriptEncodedAction(
        [
          {
            to: DAO['agent:2'],
            data: fnABI.encodeFunctionData('deposit', [
              1,
              [
                [2, 3],
                [4, 5],
              ],
            ]),
          },
        ],
        ['agent:1'],
        DAO,
      ),
    ];

    expect(actActions).to.be.eql(expectedActActions);
  });

  it('should return a correct act action when having to implicitly convert any string parameter to bytes when expecting one', async () => {
    const targetAddress = '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7';
    const params = [
      ['0x02732126661d25c59fd1cc2308ac883b422597fc3103f285f382c95d51cbe667'],
      'QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2',
    ];
    const interpreter = createAragonScriptInterpreter([
      `act agent ${targetAddress} addBatches(bytes32[],bytes) [${params[0].toString()}] ${
        params[1]
      }`,
    ]);
    const fnABI = new utils.Interface(['function addBatches(bytes32[],bytes)']);

    const actActions = await interpreter.interpret();

    const expectedActActions = [
      createTestScriptEncodedAction(
        [
          {
            to: targetAddress,
            data: fnABI.encodeFunctionData('addBatches', [
              params[0],
              utils.hexlify(
                utils.toUtf8Bytes(
                  'QmTik4Zd7T5ALWv5tdMG8m2cLiHmqtTor5QmnCSGLUjLU2',
                ),
              ),
            ]),
          },
        ],
        ['agent'],
        DAO,
      ),
    ];
    expect(actActions).to.be.eql(expectedActActions);
  });

  itChecksNonDefinedIdentifier(
    'should fail when receiving a non-defined agent identifier',
    (nonDefinedIdentifier) =>
      createAragonScriptInterpreter([
        `act ${nonDefinedIdentifier} vault "deposit()"`,
      ]),
    'act',
    0,
    true,
  );

  itChecksNonDefinedIdentifier(
    'should fail when receiving a non-defined target identifier',
    (nonDefinedIdentifier) =>
      createAragonScriptInterpreter([
        `act agent ${nonDefinedIdentifier} "deposit()"`,
      ]),
    'act',
    1,
    true,
  );

  it('should fail when receiving an invalid agent address', async () => {
    const invalidAgentAddress = 'false';
    const interpreter = createAragonScriptInterpreter([
      `act ${invalidAgentAddress} agent "deposit()"`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'act')!;
    const error = new CommandError(
      c,
      `expected a valid agent address, but got ${invalidAgentAddress}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when receiving an invalid target address', async () => {
    const invalidTargetAddress = '2.22e18';
    const interpreter = createAragonScriptInterpreter([
      `act agent ${invalidTargetAddress} "deposit()"`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'act')!;
    const error = new CommandError(
      c,
      `expected a valid target address, but got 2220000000000000000`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when receiving an invalid signature', async () => {
    const cases = [
      ['mint', 'no parenthesis'],
      ['mint(', 'left parenthesis'],
      ['mint)', 'right parenthesis'],
      ['mint(uint,)', 'right comma'],
      ['mint(,uint)', 'left comma'],
    ];

    await Promise.all(
      cases.map(([invalidSignature, msg]) => {
        const interpreter = createAragonScriptInterpreter([
          `act agent agent:2 "${invalidSignature}"`,
        ]);
        const c = findAragonOSCommandNode(interpreter.ast, 'act')!;
        const error = new CommandError(
          c,
          `expected a valid signature, but got ${invalidSignature}`,
        );

        return expectThrowAsync(
          () => interpreter.interpret(),
          error,
          `${msg} signature error mismatch`,
        );
      }),
    );
  });

  it('should fail when receiving invalid function params', async () => {
    const paramsErrors = [
      '-param 0 of type address: invalid address. Got 1000000000000000000',
      '-param 1 of type uint256: invalid BigNumber value. Got none',
    ];
    const interpreter = createAragonScriptInterpreter([
      `act agent agent:2 "deposit(address,uint256)" 1e18`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'act')!;
    const error = new CommandError(
      c,
      `error when encoding deposit call:\n${paramsErrors.join('\n')}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
