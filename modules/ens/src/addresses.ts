import { ErrorException } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { mainnet, sepolia } from "viem/chains";

export const registryMap = new Map<number, Address>([
  [mainnet.id, "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"],
  [sepolia.id, "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"],
]);

export const reverseRegistrarMap = new Map<number, Address>([
  [mainnet.id, "0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb"],
  [sepolia.id, "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6"],
]);

export const nameWrapperMap = new Map<number, Address>([
  [mainnet.id, "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401"],
  [sepolia.id, "0x0635513f179D50A207757E05759CbD106d7dFcE8"],
]);

export const ethRegistrarControllerMap = new Map<number, Address>([
  [mainnet.id, "0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547"],
  [sepolia.id, "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968"],
]);

export const publicResolverMap = new Map<number, Address>([
  [mainnet.id, "0xF29100983E058B709F3D539b0c765937B804AC15"],
  [sepolia.id, "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"],
]);

export const baseRegistrarMap = new Map<number, Address>([
  [mainnet.id, "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"],
  [sepolia.id, "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"],
]);

export function requireAddress(
  map: Map<number, Address>,
  chainId: number,
  label: string,
): Address {
  const address = map.get(chainId);
  if (!address) {
    throw new ErrorException(
      `ens: ${label} is not available on chain ${chainId}; supported chains: mainnet (1), sepolia (11155111)`,
    );
  }
  return address;
}
