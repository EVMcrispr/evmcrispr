import type { Signer, providers } from 'ethers';
import { Contract, utils } from 'ethers';

import type { Address } from '../../../..';

export const ARAGON_REGISTRARS = new Map([
  [1, '0x546aa2eae2514494eeadb7bbb35243348983c59d'],
  [4, '0x3665e7bfd4d3254ae7796779800f5b603c43c60d'],
  [100, '0x0b3b17f9705783bb51ae8272f3245d6414229b36'],
  [137, '0x7b9cd2d5eCFE44C8b64E01B93973491BBDAe879B'],
]);

export const MINIME_TOKEN_FACTORIES = new Map([
  [1, '0xA29EF584c389c67178aE9152aC9C543f9156E2B3'],
  [4, '0xad991658443c56b3dE2D7d7f5d8C68F339aEef29'],
  [100, '0xf7d36d4d46cda364edc85e5561450183469484c5'],
  [137, '0xcFed1594A5b1B612dC8199962461ceC148F14E68'],
]);

export const MINIME_TOKEN_FACTORY_INTERFACE = new utils.Interface([
  'function createCloneToken(address,uint,string,uint8,string,bool) external returns (address)',
]);

export const CONTROLLED_INTERFACE = new utils.Interface([
  'function changeController(address) external',
]);

export const getRepoContract = (
  repoAddress: Address,
  signerOrProvider: providers.Provider | Signer,
): Contract =>
  new Contract(
    repoAddress,
    [
      'function getBySemanticVersion(uint16[3] _semanticVersion) public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
      'function getLatest() public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
      'function getLatestForContractAddress(address _contractAddress) public view returns (uint16[3] semanticVersion, address contractAddress, bytes contentURI)',
    ],
    signerOrProvider,
  );

export const getAragonRegistrarContract = async (
  provider: providers.Provider,
): Promise<Contract> => {
  const chainId = (await provider.getNetwork()).chainId;

  if (!ARAGON_REGISTRARS.has(chainId)) {
    throw new Error(`aragon registrars on chain ${chainId} not supported`);
  }

  return new Contract(
    ARAGON_REGISTRARS.get(chainId)!,
    ['function register(bytes32 _subnode, address _owner) external'],
    provider,
  );
};
