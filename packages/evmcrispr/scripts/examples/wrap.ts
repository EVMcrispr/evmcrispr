import { Contract } from 'ethers';

import { EVMcrispr } from '../../src';
import { impersonateAddress } from '../../helpers/rpc';

const CHAIN_ID = 100;

const DAO = '0x2050eabe84409e480ad1062001fdb6dfbc836192';

const ADDRESS = '0x4355a2cdec902C372F404007114bbCf2C65A3eb0';

const main = async () => {
  const signer = await impersonateAddress(ADDRESS);

  signer.getChainId = async () => CHAIN_ID;

  const evmcrispr = await EVMcrispr.create(signer);
  await evmcrispr.aragon.connect(DAO)();

  const tokenManagerApp = evmcrispr.app(
    'wrappable-hooked-token-manager.open:0',
  )!;
  const tokenManager = new Contract(
    tokenManagerApp.address,
    tokenManagerApp.abiInterface,
    signer,
  );

  const txRecipt = await tokenManager.wrap('50000000000000000000');

  console.log(JSON.stringify(txRecipt));
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
