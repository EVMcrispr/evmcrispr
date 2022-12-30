import { ErrorException } from '@1hive/evmcrispr';
import type { providers } from 'ethers';
import { Contract } from 'ethers';

export const ARAGON_REGISTRARS = new Map([
  [1, '0x546aa2eae2514494eeadb7bbb35243348983c59d'],
  [4, '0x3665e7bfd4d3254ae7796779800f5b603c43c60d'],
  [100, '0x0b3b17f9705783bb51ae8272f3245d6414229b36'],
  [137, '0x7b9cd2d5eCFE44C8b64E01B93973491BBDAe879B'],
]);

export const getAragonRegistrarContract = async (
  provider: providers.Provider,
): Promise<Contract> => {
  const chainId = (await provider.getNetwork()).chainId;

  if (!ARAGON_REGISTRARS.has(chainId)) {
    throw new ErrorException(
      `aragon registrars on chain ${chainId} not supported`,
    );
  }

  return new Contract(
    ARAGON_REGISTRARS.get(chainId)!,
    ['function register(bytes32 _subnode, address _owner) external'],
    provider,
  );
};
