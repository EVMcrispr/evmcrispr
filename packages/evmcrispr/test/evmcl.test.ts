import { expect } from 'chai';

import type { ActionFunction, ActionInterpreter } from '../src';
import evmcl from '../src/evmcl';
import { APP } from './fixtures';

let _exec: any[];

const mockFunction = (func: string) => ({
  [func]: (...params: any[]) => {
    _exec.push({ func, params });
    return () => [];
  },
});

const mockExecFunction = (method: string) => ({
  exec: (id: string) => ({
    [method]: (...params: any[]) => {
      _exec.push({ func: 'exec', id, method, params });
      return () => [];
    },
  }),
});

const actionInterpreterMock = {
  ...mockFunction('newToken'),
  ...mockFunction('install'),
  ...mockFunction('upgrade'),
  ...mockFunction('grant'),
  ...mockFunction('revoke'),
  ...mockExecFunction('newVote'),
  ...mockFunction('act'),
} as unknown as ActionInterpreter;

async function check(
  actions: (evm: ActionInterpreter) => ActionFunction,
  calls: any[],
) {
  await actions(actionInterpreterMock);
  expect(_exec).to.be.deep.eq(calls);
}

describe('EVM Command Line', () => {
  beforeEach(() => {
    _exec = [];
  });

  it('new token "Trust Token" TRUST token-manager:new', async () => {
    await check(
      evmcl`
        new token "Trust Token" TRUST token-manager:new
      `,
      [
        {
          func: 'newToken',
          params: ['Trust Token', 'TRUST', 'token-manager:new', 18, true],
        },
      ],
    );
  });

  it('install token-manager:new param1 param2 param3', async () => {
    const params: string = APP.initializeParams.join(' ');
    await check(
      evmcl`
        install token-manager:new ${params}
      `,
      [
        {
          func: 'install',
          params: [
            'token-manager:new',
            APP.initializeParams.map((p) => p.toString()),
          ],
        },
      ],
    );
  });
  it('upgrade token-manager address', async () => {
    const app: string = APP.actTarget;
    await check(
      evmcl`
        upgrade token-manager ${app}
      `,
      [
        {
          func: 'upgrade',
          params: ['token-manager', APP.actTarget],
        },
      ],
    );
  });
  it('grant voting token-manager MINT_ROLE', async () => {
    await check(
      evmcl`
        grant voting token-manager MINT_ROLE
      `,
      [
        {
          func: 'grant',
          params: [['voting', 'token-manager', 'MINT_ROLE'], undefined],
        },
      ],
    );
  });
  it('revoke voting token-manager MINT_ROLE', async () => {
    await check(
      evmcl`
        revoke voting token-manager MINT_ROLE
      `,
      [
        {
          func: 'revoke',
          params: [['voting', 'token-manager', 'MINT_ROLE'], undefined],
        },
      ],
    );
  });
  it('exec voting newVote Hello 0x0', async () => {
    await check(
      evmcl`
        exec voting newVote Hello 0x0
      `,
      [
        {
          func: 'exec',
          id: 'voting',
          method: 'newVote',
          params: ['Hello', '0x0'],
        },
      ],
    );
  });
  it('exec voting newVote Hello [0x0,[3,2]]', async () => {
    await check(
      evmcl`
        exec voting newVote Hello [0x0,[3e21,2]]
      `,
      [
        {
          func: 'exec',
          id: 'voting',
          method: 'newVote',
          params: ['Hello', ['0x0', ['3e21', '2']]],
        },
      ],
    );
  });
  it('act agent 0x0 deposit(uint,unit[][]) 1 [[2],[3,4]]', async () => {
    await check(
      evmcl`
        act agent 0x0 deposit(uint,unit[][]) 1 [[2],[3,4]]
      `,
      [
        {
          func: 'act',
          params: [
            'agent',
            '0x0',
            'deposit(uint,unit[][])',
            ['1', [['2'], ['3', '4']]],
          ],
        },
      ],
    );
  });

  it('exec voting newVote 0x0 "Giveth Community Covenant Upgrade"', async () => {
    await check(
      evmcl`
      exec voting newVote 0x0 "Giveth Community Covenant Upgrade"
      `,
      [
        {
          func: 'exec',
          id: 'voting',
          method: 'newVote',
          params: ['0x0', 'Giveth Community Covenant Upgrade'],
        },
      ],
    );
  });
});
