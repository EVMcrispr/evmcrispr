import { Address } from "@1hive/connect";
import { utils, providers, BigNumber } from "ethers";
import { Interface } from "@ethersproject/abi";

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

export const toDecimals = (amount: number | string, decimals = 18): BigNumber => {
  const [integer, decimal] = String(amount).split(".");
  return BigNumber.from((integer != "0" ? integer : "") + (decimal || "").padEnd(decimals, "0"));
};

export function getFunctionParams(functionName: string, abi: Interface): [string[], string[]] {
  const params = abi.fragments.find(({ name }) => name === functionName)?.inputs;
  if (typeof params === "undefined") {
    throw new Error(`Function ${functionName} not present in ABI`);
  }
  const paramNames = params.map(({ name }) => name!);
  const paramTypes = params.map(({ type }) => type!);
  return [paramNames, paramTypes];
}
