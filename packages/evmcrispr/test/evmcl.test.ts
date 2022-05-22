import evmcl from '../src/evmcl';
import type { EVMcl } from '../src/types';
import { APP, DAO, getSigner } from './fixtures';

async function check(actions: EVMcl) {
  const signer = await getSigner();
  await actions.encode(signer);
}

describe('EVM Command Line', () => {
  it('new token "Trust Token" TRUST token-manager:new', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        new token "Trust Token" TRUST token-manager:new
      `,
    );
  });

  it('install token-manager:new param1 param2 param3', async () => {
    const params: string = APP.initializeParams.join(' ');
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        install token-manager:new ${params}
      `,
    );
  });
  it('upgrade token-manager.aragonpm.eth address', async () => {
    const app: string = APP.actTarget;
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        upgrade token-manager.aragonpm.eth ${app}
      `,
    );
  });
  it('grant voting token-manager REVOKE_VESTINGS_ROLE', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        grant voting token-manager REVOKE_VESTINGS_ROLE voting
      `,
    );
  });
  it('revoke voting token-manager MINT_ROLE', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        revoke voting token-manager MINT_ROLE
      `,
    );
  });
  it('exec token-manager mint vault 1e18', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        exec token-manager mint vault 100000e18
      `,
    );
  });
  it('act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]', async () => {
    await check(
      evmcl`
        connect ${DAO.kernel} token-manager voting
        act vault vault deposit(uint,uint[][]) 1 [[2,3],[4,5]]
      `,
    );
  });

  // it.only('act vault voting newVote 0x0 "Giveth Community Covenant Upgrade"', async () => {
  //   await check(
  //     evmcl`
  //       connect ${DAO.kernel} token-manager voting
  //       act vault voting newVote(bytes,string) 0x0 "Giveth Community Covenant Upgrade"
  //     `
  //   );
  // });
});
