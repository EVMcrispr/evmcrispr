import { utils } from 'ethers';

import type { ActionFunction, Address } from '../../..';
import { getAragonEnsResolver, resolveName } from '../../../utils';
import type AragonOS from '../AragonOS';
import { AragonDAO } from '../utils/AragonDAO';

function _loadAddressBook(module: AragonOS) {
  module.dao!.apps().forEach((app) => {
    const { address, abiInterface } = module.dao!.appCache.get(app)!;
    module.evm.addressBook.set(app, address);
    module.evm.abiStore.set(app, abiInterface);
  });
}

async function _connect(module: AragonOS, daoAddress: Address): Promise<void> {
  module.dao = await new AragonDAO(
    module.evm,
    await module.evm.signer.getChainId(),
    module.evm.env('$aragonos.subgraphUrl'),
  ).connect(daoAddress);

  _loadAddressBook(module);
}

async function _connectAddressOrName(
  module: AragonOS,
  daoAddressOrName: string,
): Promise<void> {
  const networkName = (await module.evm.signer.provider?.getNetwork())?.name;

  if (utils.isAddress(daoAddressOrName)) {
    await _connect(module, daoAddressOrName);
  } else {
    const daoAddress = await resolveName(
      `${daoAddressOrName}.aragonid.eth`,
      module.evm.env('$aragonos.ensResolver') ||
        getAragonEnsResolver(await module.evm.signer.getChainId()),
      module.evm.signer,
    );
    if (!daoAddress) {
      throw new Error(
        `ENS ${daoAddressOrName}.aragonid.eth not found in ${
          networkName ?? 'unknown network'
        }, please introduce the address of the DAO instead.`,
      );
    }
    await _connect(module, daoAddress);
  }
}

export function connect(
  module: AragonOS,
  daoAddressOrName: string,
): ActionFunction {
  return async () => {
    await _connectAddressOrName(module, daoAddressOrName);
    return [];
  };
}
