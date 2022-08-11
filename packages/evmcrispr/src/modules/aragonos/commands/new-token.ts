import { constants, utils } from 'ethers';

import type { ActionFunction, Entity } from '../../..';
import { buildNonceForAddress, calculateNewProxyAddress } from '../../../utils';
import type { ConnectedAragonOS } from '../AragonOS';

export function newToken(
  module: ConnectedAragonOS,
  name: string,
  symbol: string,
  controller: Entity,
  decimals = 18,
  transferable = true,
): ActionFunction {
  const factories = new Map([
    [1, '0xA29EF584c389c67178aE9152aC9C543f9156E2B3'],
    [4, '0xad991658443c56b3dE2D7d7f5d8C68F339aEef29'],
    [100, '0xf7d36d4d46cda364edc85e5561450183469484c5'],
    [137, '0xcFed1594A5b1B612dC8199962461ceC148F14E68'],
  ]);
  const factory = new utils.Interface([
    'function createCloneToken(address,uint,string,uint8,string,bool) external returns (address)',
  ]);
  const controlled = new utils.Interface([
    'function changeController(address) external',
  ]);
  return async () => {
    const chainId = await module.evm.signer.getChainId();
    if (!factories.has(chainId)) {
      throw new Error(`No MiniMeTokenFactory registered in network ${chainId}`);
    }

    try {
      module.evm.resolver.resolveEntity(controller);
    } catch (e) {
      await module.registerNextProxyAddress(controller);
    }

    const factoryAddr = factories.get(chainId)!;
    const controllerAddress = module.evm.resolver.resolveEntity(controller);
    const nonce = await buildNonceForAddress(
      factoryAddr,
      module.evm.incrementNonce(factoryAddr),
      module.evm.signer.provider!,
    );
    const newTokenAddress = calculateNewProxyAddress(factoryAddr, nonce);
    module.evm.addressBook.set(`token:${symbol}`, newTokenAddress);
    return [
      {
        to: factoryAddr,
        data: factory.encodeFunctionData('createCloneToken', [
          constants.AddressZero,
          0,
          name,
          decimals,
          symbol,
          transferable,
        ]),
      },
      {
        to: newTokenAddress,
        data: controlled.encodeFunctionData('changeController', [
          controllerAddress,
        ]),
      },
    ];
  };
}
