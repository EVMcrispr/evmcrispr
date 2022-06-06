import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';

import type { ActionFunction } from '../src';
import { EVMcrispr } from '../src';
import evmcl from '../src/evmcl';
import type { EVMcl } from '../src/types';
import { APP, DAO, getSigner } from './fixtures';

let signer: SignerWithAddress;
let evm: EVMcrispr;

async function check(
  actions: EVMcl,
  expectedActions: ActionFunction[],
  checkVars: string[] = [],
  forwarders: string[] = ['token-manager', 'voting'],
) {
  const expected = await evm.encode(expectedActions, forwarders);
  const actual = await actions.encode(signer);
  expect(actual.actions).to.be.deep.eq(expected.actions);
  for (const varName of checkVars) {
    expect((await actions.evmcrispr(signer)).env(varName)).to.be.eq(
      evm.env(varName),
    );
  }
}

describe('EVM Command Line', () => {
  beforeEach(async () => {
    signer = await getSigner();
    evm = await EVMcrispr.create(signer);
  });
  it('new token "Trust Token" TRUST token-manager:new', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        new token "Trust Token" TRUST token-manager:new
        install token-manager:new token:TRUST false 0
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.aragon.newToken('Trust Token', 'TRUST', 'token-manager:new'),
        evm.aragon.install('token-manager:new', ['token:TRUST', false, 0]),
      ],
    );
  });

  it('new token "Trust Token" TRUST agent', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        new token "Trust Token" TRUST agent
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.aragon.newToken('Trust Token', 'TRUST', 'agent'),
      ],
    );
  });

  it('install token-manager:new param1 param2 param3', async () => {
    const params: string = APP.initializeParams.join(' ');
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        install token-manager:new ${params}
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.aragon.install('token-manager:new', APP.initializeParams),
      ],
    );
  });
  it('upgrade token-manager.aragonpm.eth address', async () => {
    const app: string = APP.actTarget;
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        upgrade token-manager.aragonpm.eth ${app}
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.aragon.upgrade('token-manager.aragonpm.eth', app),
      ],
    );
  });
  it('grant voting token-manager REVOKE_VESTINGS_ROLE', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        grant voting token-manager REVOKE_VESTINGS_ROLE voting
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.aragon.grant(
          ['voting', 'token-manager', 'REVOKE_VESTINGS_ROLE'],
          'voting',
        ),
      ],
    );
  });
  it('revoke voting token-manager MINT_ROLE', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        revoke voting token-manager MINT_ROLE
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.aragon.revoke(['voting', 'token-manager', 'MINT_ROLE']),
      ],
    );
  });
  it('exec token-manager mint vault 1e18', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        exec token-manager mint vault 100000e18
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.std.exec('token-manager', 'mint', ['vault', '100000e18']),
      ],
    );
  });
  it('act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.aragon.act('vault', 'vault', 'deposit(uint,uint[][])', [
          1,
          [
            [2, 3],
            [4, 5],
          ],
        ]),
      ],
    );
  });
  it('exec finance newImmediatePayment @token(SUSHI) @me @token.balance(SUSHI,@me) "sushi for two"', async () => {
    await check(
      evmcl` 
        connect ${DAO.kernel} token-manager voting
        set $token.tokenlist https://token-list.sushi.com/
        exec finance newImmediatePayment @token(SUSHI) @me @token.balance(SUSHI,@me) "sushi for two"
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.set('$token.tokenlist', 'https://token-list.sushi.com/'),
        evm.std.exec('finance', 'newImmediatePayment', [
          evm.helpers.token(evm, 'SUSHI'),
          evm.helpers.me(evm),
          evm.helpers['token.balance'](evm, 'SUSHI', evm.helpers.me(evm)),
          'sushi for two',
        ]),
      ],
      ['$token.tokenlist'],
    );
  });
  it('exec vault transfer @token(SUSHI) @me @token.balance(SUSHI,vault)', async () => {
    await check(
      evmcl` 
        connect ${DAO.kernel} token-manager voting
        set $token.tokenlist https://token-list.sushi.com/
        exec vault transfer @token(SUSHI) @me @token.balance(SUSHI,vault)
      `,
      [
        evm.aragon.connect(DAO.kernel),
        evm.set('$token.tokenlist', 'https://token-list.sushi.com/'),
        evm.std.exec('vault', 'transfer', [
          evm.helpers.token(evm, 'SUSHI'),
          evm.helpers.me(evm),
          evm.helpers['token.balance'](evm, 'SUSHI', 'vault'),
        ]),
      ],
      ['$token.tokenlist'],
    );
  });
  it('set $var value in multiple words', async () => {
    await check(
      await evmcl`
        set $var value in multiple words
      `,
      [evm.set('$var', 'value in multiple words')],
      ['$var'],
      [],
    );
  });
  it('new dao', async () => {
    await check(
      evmcl`
        new dao name
      `,
      [evm.aragon.newDao('name')],
      [],
      [],
    );
  });
});
