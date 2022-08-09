import type { Signer, providers } from 'ethers';
import { Contract } from 'ethers';

import type { Address } from '../../..';
import { isAppIdentifier, parseAppIdentifier } from '../../../utils';

export const formatIdentifier = (possibleIdentifier: string): string => {
  if (isAppIdentifier(possibleIdentifier)) {
    const [, , appIndex] = parseAppIdentifier(possibleIdentifier)!;

    if (!appIndex) {
      return `${possibleIdentifier}:0`;
    }
    return possibleIdentifier;
  }

  return possibleIdentifier;
};

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
