import { utils } from 'ethers';

import type { ActionFunction } from '../../..';
import {
  buildNonceForAddress,
  calculateNewProxyAddress,
  getAragonEnsResolver,
  resolveName,
} from '../../../utils';
import type AragonOS from '../AragonOS';

function registerAragonId(
  module: AragonOS,
  name: string,
  owner: string,
): ActionFunction {
  const aragonIds = new Map([
    [1, '0x546aa2eae2514494eeadb7bbb35243348983c59d'],
    [4, '0x3665e7bfd4d3254ae7796779800f5b603c43c60d'],
    [100, '0x0b3b17f9705783bb51ae8272f3245d6414229b36'],
    [137, '0x7b9cd2d5eCFE44C8b64E01B93973491BBDAe879B'],
  ]);
  const aragonId = new utils.Interface([
    'function register(bytes32 _subnode, address _owner) external',
  ]);
  return async () => {
    const chainId = await module.evm.signer.getChainId();
    if (!aragonIds.has(chainId)) {
      throw new Error(
        `We do not support aragonids for network with chain id ${chainId} yet.`,
      );
    }
    return [
      {
        to: aragonIds.get(chainId)!,
        data: aragonId.encodeFunctionData('register', [
          utils.solidityKeccak256(['string'], [name]),
          owner,
        ]),
      },
    ];
  };
}

export function newDao(module: AragonOS, name: string): ActionFunction {
  const bareTemplate = new utils.Interface([
    'function newInstance() public returns (address)',
  ]);

  return async () => {
    const chainId = await module.evm.signer.getChainId();
    const bareTemplateAddr = await resolveName(
      `bare-template.aragonpm.eth`,
      getAragonEnsResolver(chainId),
      module.evm.signer,
    );

    if (!bareTemplateAddr) {
      throw Error('Bare Template is not specified for network ' + chainId);
    }

    const nonce = await buildNonceForAddress(
      bareTemplateAddr!,
      module.evm.incrementNonce(bareTemplateAddr),
      module.evm.signer.provider!,
    );
    const newDaoAddress = calculateNewProxyAddress(bareTemplateAddr, nonce);
    module.evm.addressBook.set(`dao:${name}`, newDaoAddress);

    return [
      {
        to: bareTemplateAddr!,
        data: bareTemplate.encodeFunctionData('newInstance', []),
      },
      ...(await registerAragonId(module, name, newDaoAddress)()),
    ];
  };
}
