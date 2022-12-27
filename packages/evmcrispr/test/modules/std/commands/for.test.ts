import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import type { Action } from '../../../../src/types';
// import { CommandError } from '../../../../src/errors';

import { createInterpreter } from '../../../test-helpers/cas11';
// import { expectThrowAsync } from '../../../test-helpers/expects';
// import { findStdCommandNode } from '../../../test-helpers/std';
import { encodeAction } from '../../../../src/utils';

describe('Std > commands > for $var of $array ( ...commands )', () => {
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it('should return the correct actions', async () => {
    const target = '0x30c9aa17fc30e4c23a65680a35b33e8f3b4198a2';
    const interpreter = createInterpreter(
      `
    set $target ${target}
    set $holders [0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7,0xA1514067E6fE7919FB239aF5259FfF120902b4f9]
    for $voteId of [1,2] (
      for $holder of $holders (
        exec $target vote(uint,bool,bool) $voteId true true --from $holder
        exec $target vote(uint,bool,bool) ($voteId + 1) false true --from $holder
      )
    )`,
      signer,
    );

    const result = await interpreter.interpret();

    const expectedCallAction: Action[] = [
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [1, true, true]),
        from: '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7',
      },
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [2, false, true]),
        from: '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7',
      },
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [1, true, true]),
        from: '0xA1514067E6fE7919FB239aF5259FfF120902b4f9',
      },
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [2, false, true]),
        from: '0xA1514067E6fE7919FB239aF5259FfF120902b4f9',
      },
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [2, true, true]),
        from: '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7',
      },
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [3, false, true]),
        from: '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7',
      },
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [2, true, true]),
        from: '0xA1514067E6fE7919FB239aF5259FfF120902b4f9',
      },
      {
        ...encodeAction(target, 'vote(uint,bool,bool)', [3, false, true]),
        from: '0xA1514067E6fE7919FB239aF5259FfF120902b4f9',
      },
    ];

    expect(result).eql(expectedCallAction);
  });
});
