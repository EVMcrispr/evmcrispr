import { Contract, utils } from 'ethers';

import evmcl from '../src/evmcl';
import { impersonateAddress } from '../helpers/rpc';
import { EVMcrispr } from '../src';

const will = '0xb4124cEB3451635DAcedd11767f004d8a28c6eE7';

describe.skip('Token Manager Upgrade', () => {
  it('Changes the permissions to the new DAO', async () => {
    const signer = await impersonateAddress(will);

    const x = await (
      await EVMcrispr.create(signer)
    ).aragon.helpers.aragonEns('transactions.open.aragonpm.eth')();
    console.log(x);

    const y = await new Contract(
      x,
      ['function kernel() external view returns (address)'],
      signer,
    ).kernel();

    const acl = await new Contract(
      y,
      ['function acl() external view returns (address)'],
      signer,
    ).acl();

    const pm = await new Contract(
      acl,
      [
        'function getPermissionManager(address,bytes32) external view returns (address)',
      ],
      signer,
    ).getPermissionManager(x, utils.id('CREATE_VERSION_ROLE'));

    console.log(pm);

    const { actions, forward } = await evmcl`
              set $repo @aragonEns(transactions.open.aragonpm.eth)
              exec $repo newVersion(uint16[3],address,bytes) [1,0,0] 0x7cdB48CBF25F4f044eEaE83187E3825Ae301C93d ipfs:Qma2cVx7i9eTu9VSBexWVbfqeS1qwKc8zFFnwV4zrjTMUJ
            `.encode(await impersonateAddress(will));
    console.log(actions);
    await forward();
  });
});
