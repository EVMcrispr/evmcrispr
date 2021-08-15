import { Address } from "@1hive/connect";
import { utils, providers } from "ethers";

export async function buildNonceForAddress(
  address: Address,
  index: number,
  provider: providers.Provider
): Promise<string> {
  const txCount = await provider.getTransactionCount(address);
  return utils.hexlify(txCount + index);
}

/**
 * Calculates the next created address by the kernel
 * @dev see https://ethereum.stackexchange.com/questions/760/how-is-the-address-of-an-ethereum-contract-computed/761#761
 * @param {*} daoAddress address of the kernel
 * @param {*} nonce address nonce
 * @returns {string} conterfactual address
 */
export function calculateNewProxyAddress(daoAddress: Address, nonce: string): Address {
  const rlpEncoded = utils.RLP.encode([utils.hexlify(daoAddress), nonce]);
  const contractAddressLong = utils.keccak256(rlpEncoded);
  const contractAddress = `0x${contractAddressLong.substr(-40)}`;

  return contractAddress;
}
