import type { BigNumberish, providers } from 'ethers';
import { BigNumber, Contract, utils } from 'ethers';

/**
 * Standarized storage slot determined by bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
 * and defined on EIP-1967 (https://eips.ethereum.org/EIPS/eip-1967#logic-contract-address)
 */
const EIP1967_STORAGE_SLOT = utils.hexlify(
  BigNumber.from(utils.id('eip1967.proxy.implementation')).sub(1),
);

const EIP1967_BEACON_STORAGE_SLOT = utils.hexlify(
  BigNumber.from(utils.id('eip1967.proxy.beacon')).sub(1),
);

const EIP1822_PROXIABLE = utils.id('PROXIABLE');

const getAddressFromStorageSlot = async (
  contractAddress: string,
  storageSlot: BigNumberish,
  provider: providers.Provider,
) => {
  const rawImplementationAddress = await provider.getStorageAt(
    contractAddress,
    storageSlot,
  );
  return utils.hexStripZeros(rawImplementationAddress);
};

export async function fetchImplementationAddress(
  address: string,
  provider: providers.Provider,
): Promise<string> {
  let implementationAddress;
  implementationAddress = await getAddressFromStorageSlot(
    address,
    EIP1967_STORAGE_SLOT,
    provider,
  );
  if (implementationAddress && implementationAddress !== '0x') {
    return (
      (await fetchImplementationAddress(implementationAddress, provider)) ||
      implementationAddress
    );
  }

  // TODO: Check if this works with UUPS
  implementationAddress = await getAddressFromStorageSlot(
    address,
    EIP1822_PROXIABLE,
    provider,
  );
  if (implementationAddress && implementationAddress !== '0x') {
    return (
      (await fetchImplementationAddress(implementationAddress, provider)) ||
      implementationAddress
    );
  }

  try {
    const proxyContract = new Contract(
      address,
      [
        'function implementation() public view returns (address)',
        'function childImplementation() external view returns (address)',
      ],
      provider,
    );
    implementationAddress = await proxyContract.implementation();
  } catch (e) {
    implementationAddress = null;
    const beaconAddress = await getAddressFromStorageSlot(
      address,
      EIP1967_BEACON_STORAGE_SLOT,
      provider,
    );
    if (beaconAddress !== '0x') {
      const proxyContract = new Contract(
        beaconAddress,
        [
          'function implementation() public view returns (address)',
          'function childImplementation() external view returns (address)',
        ],
        provider,
      );
      try {
        implementationAddress = await proxyContract.implementation();
      } catch (err) {
        implementationAddress = await proxyContract.childImplementation();
      }
      implementationAddress =
        (await fetchImplementationAddress(implementationAddress, provider)) ||
        implementationAddress;
      // TODO: Missing Special cases:
      // if (
      //   beaconAddress.toLowerCase() ===
      //   "0xbe86f647b167567525ccaafcd6f881f1ee558216"
      // ) {
      //   return [
      //     implementationAddress,
      //     "0x2c556ffbdcbd5abae92fed0231e2d1752a29d493",
      //   ];
      // }
    }
  }

  return implementationAddress;
}
