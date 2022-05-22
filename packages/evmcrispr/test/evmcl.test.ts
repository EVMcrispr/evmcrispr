import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';

import type { ActionFunction } from '../src';
import { EVMcrispr } from '../src';
import evmcl from '../src/evmcl';
import type { EVMcl } from '../src/types';
import { APP, DAO, getSigner } from './fixtures';

let signer: SignerWithAddress;
let evm: EVMcrispr;

async function check(actions: EVMcl, expectedActions: ActionFunction[]) {
  const expected = await evm.encode(expectedActions, [
    'token-manager',
    'voting',
  ]);
  expect(await actions.encode(signer)).to.be.deep.eq(expected);
}

describe('EVM Command Line', () => {
  beforeEach(async () => {
    signer = await getSigner();
    evm = await EVMcrispr.create(DAO.kernel, signer);
  });
  it('new token "Trust Token" TRUST token-manager:new', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        new token "Trust Token" TRUST token-manager:new
        install token-manager:new token:TRUST false 0
      `,
      [
        evm.newToken('Trust Token', 'TRUST', 'token-manager:new'),
        evm.install('token-manager:new', ['token:TRUST', false, 0]),
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
      [evm.install('token-manager:new', APP.initializeParams)],
    );
  });
  it('upgrade token-manager.aragonpm.eth address', async () => {
    const app: string = APP.actTarget;
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        upgrade token-manager.aragonpm.eth ${app}
      `,
      [evm.upgrade('token-manager.aragonpm.eth', app)],
    );
  });
  it('grant voting token-manager REVOKE_VESTINGS_ROLE', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        grant voting token-manager REVOKE_VESTINGS_ROLE voting
      `,
      [
        evm.grant(
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
      [evm.revoke(['voting', 'token-manager', 'MINT_ROLE'])],
    );
  });
  it('exec token-manager mint vault 1e18', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        exec token-manager mint vault 100000e18
      `,
      [evm.exec('token-manager', 'mint', ['vault', '100000e18'])],
    );
  });
  it('act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]
      `,
      [
        evm.act('vault', 'vault', 'deposit(uint,uint[][])', [
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
        evm.set('$token.tokenlist', 'https://token-list.sushi.com/'),
        evm.exec('finance', 'newImmediatePayment', [
          evm.helpers.token(evm, 'SUSHI'),
          evm.helpers.me(evm),
          evm.helpers['token.balance'](evm, 'SUSHI', evm.helpers.me(evm)),
          'sushi for two',
        ]),
      ],
    );
  });
});
