import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { utils } from 'ethers';

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
  checkWith: string[] = [],
) {
  const expected = await evm.encode(expectedActions);
  const actual = await actions.encode(signer);
  expect(actual.actions).to.be.deep.eq(expected.actions);
  for (const i in checkVars) {
    if (typeof checkWith[i] !== 'undefined') {
      expect([
        evm.env(checkVars[i]),
        (await actions.evmcrispr(signer)).env(checkVars[i]),
      ]).to.be.deep.eq([checkWith[i], checkWith[i]]);
    } else {
      expect((await actions.evmcrispr(signer)).env(checkVars[i])).to.be.deep.eq(
        evm.env(checkVars[i]),
      );
    }
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

  it('install token-manager:new param1 param2 param3 param4 --version 1.0.0', async () => {
    const params: string = APP.initializeParams.join(' ');
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          install token-manager:new ${params} false --version 1.0.0
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [
            dao.install(
              'token-manager:new',
              [...APP.initializeParams, 'false'],
              { version: '1.0.0' },
            ),
          ],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });

  it('upgrade token-manager', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          upgrade token-manager
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.upgrade('token-manager')],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('upgrade token-manager version', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          upgrade token-manager 2.0.0
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.upgrade('token-manager', '2.0.0')],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('upgrade token-manager address', async () => {
    const app: string = APP.actTarget;
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          upgrade token-manager ${app}
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [dao.upgrade('token-manager', app)],
          ['token-manager', 'voting'],
        ),
      ],
    );
  });
  it('grant voting token-manager REVOKE_VESTINGS_ROLE --oracle token-manager', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting (
          grant voting token-manager REVOKE_VESTINGS_ROLE voting --oracle token-manager
        )
      `,
      [
        evm.aragon.connect(
          DAO.kernel,
          (dao) => [
            dao.grant(
              'voting',
              'token-manager',
              'REVOKE_VESTINGS_ROLE',
              'voting',
              { oracle: 'token-manager' },
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
          (dao) => [dao.revoke('voting', 'token-manager', 'MINT_ROLE')],
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

  it('set $var @id(@date(now))', async () => {
    const evmSet = evm.set(
      '$var',
      evm.std.helpers.id(evm.std.helpers.date('now')),
    );
    const val = utils.id(Math.floor(new Date().valueOf() / 1000).toString());
    await check(
      evmcl` 
        set $var @id(@date(now))
      `,
      [evmSet],
      ['$var'],
      [val],
    );
  });

  it('set $var @date(2022-05-03T03:11:05Z,+5d-44m)', async () => {
    await check(
      evmcl` 
        set $var @date(2022-05-03T03:11:05Z,+5d-44m)
      `,
      [
        evm.set(
          '$var',
          evm.std.helpers.date('2022-05-03T03:11:05Z', '+5d-44m'),
        ),
      ],
      ['$var'],
      [
        (
          Math.floor(new Date('2022-05-03T03:11:05Z').valueOf() / 1000) +
          5 * 24 * 60 * 60 -
          44 * 60
        ).toString(),
      ],
    );
  });

  it('set $var @ipfs(This should be pinned in IPFS)', async () => {
    if (!process.env.VITE_PINATA_JWT) {
      throw new Error('JWT not definied in environment variables.');
    }
    await check(
      evmcl`
        set $ipfs.jwt ${process.env.VITE_PINATA_JWT}
        set $var @ipfs(This should be pinned in IPFS)
      `,
      [
        evm.set('$ipfs.jwt', process.env.VITE_PINATA_JWT),
        evm.set('$var', evm.std.helpers.ipfs('This should be pinned in IPFS')),
      ],
      ['$var'],
      ['QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns'],
    );
  });

  it('set $var @calc(2+3/2)', async () => {
    await check(
      evmcl`
        set $var @calc(2+3/2)
      `,
      [evm.set('$var', evm.std.helpers.calc('2+3/2'))],
      ['$var'],
      ['3'],
    );
  });

  it('set $var @get($weth,name():(string))', async () => {
    await check(
      evmcl`
          set $weth 0xdf032bc4b9dc2782bb09352007d4c57b75160b15
          set $abi name():(string)
          set $var @get($weth,$abi)
      `,
      [
        evm.set(
          '$var',
          evm.std.helpers.get(
            '0xdf032bc4b9dc2782bb09352007d4c57b75160b15',
            'name():(string)',
          ),
        ),
      ],
      ['$var'],
      ['Wrapped Ether'],
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
      ['https://token-list.sushi.com/'],
    );
  });
  it('set $var value in multiple words', async () => {
    await check(
      await evmcl`
        set $var value in multiple words
      `,
      [evm.set('$var', 'value in multiple words')],
      ['$var'],
      ['value in multiple words'],
    );
  });
  it('new dao', async () => {
    await check(
      evmcl`
        new dao name
      `,
      [evm.aragon.newDao('name')],
      [],
    );
  });
});
