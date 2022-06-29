import { Contract, utils } from 'ethers';

import type { ActionFunction, LabeledAppIdentifier } from '../../..';
import { ErrorException } from '../../../errors';
import type { EntityWithAbi } from '../../../types';
import {
  buildAppArtifact,
  buildAppPermissions,
  fetchAppArtifact,
  getFunctionParams,
  parseLabeledAppIdentifier,
} from '../../../utils';
import type { ConnectedAragonOS } from '../AragonOS';
import aragonEns from '../helpers/aragonEns';

/**
 * Encode an action that installs a new app.
 * @param identifier [[LabeledAppIdentifier | Identifier]] of the app to install.
 * @param initParams Parameters to initialize the app.
 * @returns A function which returns a promise that resolves to the installation action.
 */
export function install(
  module: ConnectedAragonOS,
  identifier: LabeledAppIdentifier,
  initParams: any[] = [],
  opts?: { version?: string },
): ActionFunction {
  return async () => {
    try {
      const [appName, registry] = parseLabeledAppIdentifier(identifier);
      const repoAddr = await aragonEns(module.evm, `${appName}.${registry}`);
      const repo = new Contract(
        repoAddr,
        [
          'function getBySemanticVersion(uint16[3] _semanticVersion) public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
          'function getLatest() public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
        ],
        module.evm.signer,
      );
      const [, codeAddress, contentUri] = await (opts?.version
        ? repo.getBySemanticVersion(opts.version.split('.'))
        : repo.getLatest());

      if (!module.appArtifactCache.has(codeAddress)) {
        const artifact = await fetchAppArtifact(
          module.evm.ipfsResolver,
          utils.toUtf8String(contentUri),
        );
        module.appArtifactCache.set(codeAddress, buildAppArtifact(artifact));
      }

      const { abiInterface, roles } = module.appArtifactCache.get(codeAddress)!;
      const kernel: EntityWithAbi = module.resolveApp('kernel');
      const [, types] = getFunctionParams('initialize', abiInterface);
      const encodedInitializeFunction = abiInterface.encodeFunctionData(
        'initialize',
        module.evm.resolver.resolveParams(initParams, types),
      );
      const appId = utils.namehash(`${appName}.${registry}`);
      if (!module.evm.addressBook.has(identifier)) {
        await module.registerNextProxyAddress(identifier);
      }
      const proxyContractAddress =
        module.evm.resolver.resolveEntity(identifier);
      if (module.appCache.has(identifier)) {
        throw new ErrorException(`Identifier ${identifier} is already in use.`);
      }

      module.appCache.set(identifier, {
        abiInterface: abiInterface,
        address: proxyContractAddress,
        codeAddress,
        contentUri,
        name: appName,
        permissions: buildAppPermissions(roles, []),
        registryName: registry,
      });

      return [
        {
          to: kernel.address,
          data: kernel.abiInterface.encodeFunctionData(
            'newAppInstance(bytes32,address,bytes,bool)',
            [appId, codeAddress, encodedInitializeFunction, false],
          ),
        },
      ];
    } catch (err: any) {
      err.message = `Error when encoding ${identifier} installation action: ${err.message}`;
      throw err;
    }
  };
}
