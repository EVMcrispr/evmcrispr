import { utils } from 'ethers';

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
import type AragonOS from '../AragonOS';

/**
 * Encode an action that installs a new app.
 * @param identifier [[LabeledAppIdentifier | Identifier]] of the app to install.
 * @param initParams Parameters to initialize the app.
 * @returns A function which returns a promise that resolves to the installation action.
 */
export function install(
  module: AragonOS,
  identifier: LabeledAppIdentifier,
  initParams: any[] = [],
): ActionFunction {
  return async () => {
    if (!module.dao) {
      throw new ErrorException('Not connected to any DAO');
    }
    try {
      const [appName, registry] = parseLabeledAppIdentifier(identifier);
      const appRepo = await module.dao.connector.repo(appName, registry);
      const { codeAddress, contentUri, artifact: repoArtifact } = appRepo;

      if (!module.dao.appArtifactCache.has(codeAddress)) {
        const artifact =
          repoArtifact ??
          (await fetchAppArtifact(module.evm.ipfsResolver, contentUri));
        module.dao.appArtifactCache.set(
          codeAddress,
          buildAppArtifact(artifact),
        );
      }

      const { abiInterface, roles } =
        module.dao.appArtifactCache.get(codeAddress)!;
      const kernel: EntityWithAbi = module.evm.resolver.resolveApp('kernel');
      const [, types] = getFunctionParams('initialize', abiInterface);
      const encodedInitializeFunction = abiInterface.encodeFunctionData(
        'initialize',
        module.evm.resolver.resolveParams(initParams, types),
      );
      const appId = utils.namehash(`${appName}.${registry}`);
      if (!module.evm.addressBook.has(identifier)) {
        await module.dao.registerNextProxyAddress(identifier);
      }
      const proxyContractAddress =
        module.evm.resolver.resolveEntity(identifier);
      if (module.dao.appCache.has(identifier)) {
        throw new ErrorException(`Identifier ${identifier} is already in use.`);
      }

      module.dao.appCache.set(identifier, {
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
