import type { Address } from '@1hive/evmcrispr';
import { Contract } from 'ethers';
import type { Signer, providers } from 'ethers';

export const SEMANTIC_VERSION_REGEX = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/;

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
