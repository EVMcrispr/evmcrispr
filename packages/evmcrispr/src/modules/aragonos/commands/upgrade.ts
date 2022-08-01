import { Contract, constants, utils } from 'ethers';
import { isAddress } from 'ethers/lib/utils';

import type { ActionFunction, Address } from '../../..';
import { ErrorException } from '../../../errors';
import type { ConnectedAragonOS } from '../AragonOS';
import aragonEns from '../helpers/aragonEns';

const semanticVersion = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/;

/**
 * Upgrade all installed apps of a specific APM repo to a new implementation contract.
 * @param apmRepo ENS name of the APM repository
 * @param newAppAddress Address of the new implementation contract
 * @returns A function that returns the upgrade action
 */
export function upgrade(
  module: ConnectedAragonOS,
  apmRepo: string,
  newAppAddress?: Address,
): ActionFunction {
  return async () => {
    if (apmRepo.endsWith('aragonpm.eth')) {
      throw new ErrorException(`The suffix aragonpm.eth is not needed.`);
    }

    const name = `${apmRepo}.aragonpm.eth`;
    const kernel = module.app('kernel');
    const KERNEL_APP_BASE_NAMESPACE = utils.id('base');
    const appId = utils.namehash(name);
    if (
      (await kernel.getApp(KERNEL_APP_BASE_NAMESPACE, appId)) ===
      constants.AddressZero
    ) {
      throw new Error(`${apmRepo} not installed in current DAO.`);
    }

    const repoAddr = await aragonEns(module.evm, name);
    const repo = new Contract(
      repoAddr,
      [
        'function getBySemanticVersion(uint16[3] _semanticVersion) public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
        'function getLatest() public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
      ],
      module.evm.signer,
    );

    if (!newAppAddress) {
      [, newAppAddress] = await repo.getLatest();
    } else if (semanticVersion.test(newAppAddress)) {
      [, newAppAddress] = await repo.getBySemanticVersion(
        newAppAddress.split('.'),
      );
    } else if (!isAddress(newAppAddress)) {
      throw new Error(
        'Second upgrade parameter must be a semantic version, an address, or nothing',
      );
    }

    return [
      {
        to: kernel.address,
        data: kernel.interface.encodeFunctionData(
          'setApp(bytes32,bytes32,address)',
          [KERNEL_APP_BASE_NAMESPACE, appId, newAppAddress],
        ),
      },
    ];
  };
}
