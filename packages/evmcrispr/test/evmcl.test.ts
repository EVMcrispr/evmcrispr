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
  forwarders: string[] = [],
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
        connect ${DAO.kernel} token-manager voting (
          new token "Trust Token" TRUST token-manager:new
          install token-manager:new token:TRUST false 0
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [
            dao.newToken('Trust Token', 'TRUST', 'token-manager:new'),
            dao.install('token-manager:new', ['token:TRUST', false, 0]),
          ],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });

  it('new token "Trust Token" TRUST vault', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          new token "Trust Token" TRUST vault
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.newToken('Trust Token', 'TRUST', 'vault')],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });

  it('install token-manager:new param1 param2 param3', async () => {
    const params: string = APP.initializeParams.join(' ');
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          install token-manager:new ${params}
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.install('token-manager:new', APP.initializeParams)],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('upgrade token-manager.aragonpm.eth address', async () => {
    const app: string = APP.actTarget;
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          upgrade token-manager.aragonpm.eth ${app}
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.upgrade('token-manager.aragonpm.eth', app)],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('grant voting token-manager REVOKE_VESTINGS_ROLE', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          grant voting token-manager REVOKE_VESTINGS_ROLE voting
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [
            dao.grant(
              ['voting', 'token-manager', 'REVOKE_VESTINGS_ROLE'],
              'voting',
            ),
          ],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('revoke voting token-manager MINT_ROLE', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          revoke voting token-manager MINT_ROLE
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.revoke(['voting', 'token-manager', 'MINT_ROLE'])],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('exec token-manager mint vault 1e18', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          exec token-manager mint vault 100000e18
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.exec('token-manager', 'mint', ['vault', '100000e18'])],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [
            dao.act('vault', 'vault', 'deposit(uint,uint[][])', [
              1,
              [
                [2, 3],
                [4, 5],
              ],
            ]),
          ],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('exec finance newImmediatePayment @token(SUSHI) @me @token.balance(SUSHI,@me) "sushi for two"', async () => {
    await check(
      evmcl` 
        connect ${DAO.kernel} token-manager voting (
          set $token.tokenlist https://token-list.sushi.com/
          exec finance newImmediatePayment @token(SUSHI) @me @token.balance(SUSHI,@me) "sushi for two"
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [
            evm.set('$token.tokenlist', 'https://token-list.sushi.com/'),
            dao.exec('finance', 'newImmediatePayment', [
              evm.helpers.token('SUSHI'),
              evm.helpers.me(),
              evm.helpers['token.balance']('SUSHI', evm.helpers.me()),
              'sushi for two',
            ]),
          ],
          ['token-manager', 'voting'],
        ),
      ],
      ['$token.tokenlist'],
    );
  });
  it.skip('exec vault transfer @token(SUSHI) @me @token.balance(SUSHI,vault)', async () => {
    // FIXME
    await check(
      evmcl` 
        connect ${DAO.kernel} token-manager voting (
          set $token.tokenlist https://token-list.sushi.com/
          exec vault transfer @token(SUSHI) @me @token.balance(SUSHI,vault)
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [
            evm.set('$token.tokenlist', 'https://token-list.sushi.com/'),
            dao.exec('vault', 'transfer', [
              evm.helpers.token('SUSHI'),
              evm.helpers.me(),
              evm.helpers['token.balance']('SUSHI', 'vault'),
            ]),
          ],
          ['token-manager', 'voting'],
        ),
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
