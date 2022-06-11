import { utils } from 'ethers';

import type { ActionFunction, Address } from '../../..';
import { ErrorException } from '../../../errors';
import type { ConnectedAragonOS } from '../AragonOS';

/**
 * Upgrade all installed apps of a specific APM repo to a new implementation contract.
 * @param apmRepo ENS name of the APM repository
 * @param newAppAddress Address of the new implementation contract
 * @returns A function that returns the upgrade action
 */
export function upgrade(
  module: ConnectedAragonOS,
  apmRepo: string,
  newAppAddress: Address,
): ActionFunction {
  return async () => {
    if (!apmRepo.endsWith('.eth')) {
      throw new ErrorException(`The APM repo must be an ENS name.`);
    }
    const kernel = module.resolveApp('kernel');
    const KERNEL_APP_BASE_NAMESPACE = utils.id('base');
    const appId = utils.namehash(apmRepo);
    return [
      {
        to: kernel.address,
        data: kernel.abiInterface.encodeFunctionData(
          'setApp(bytes32,bytes32,address)',
          [KERNEL_APP_BASE_NAMESPACE, appId, newAppAddress],
        ),
      },
    ];
  };
}
