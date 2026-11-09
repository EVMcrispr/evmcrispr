import { chainLabel, ErrorException } from "@evmcrispr/sdk";
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

/** ENSv2's ETHRegistrar: since ENSv2 (mainnet 2026-10-27) the only way to
 *  register a .eth name. No v1 controller is authorised on either chain.
 *  Addresses from ensjs; checked to have code and the register role. */
export const ethRegistrarMap = new Map<number, Address>([
  [mainnet.id, "0xD6D8369e55c94Ae8AFA714E6cF7AB5bE54D5CC81"],
  [sepolia.id, "0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3"],
]);

/** ENSv2's ETHRegistry: the .eth registry of ENSv2 names, an ERC-1155 whose
 *  tokens carry the owner's roles. Names still on ENS v1 are RESERVED there. */
export const ethRegistryMap = new Map<number, Address>([
  [mainnet.id, "0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2"],
  [sepolia.id, "0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4"],
]);

/** ENSv2's ETHRenewerV1: renews names still on ENS v1 (the only v1
 *  controller left on the BaseRegistrar). ENSv2 names renew on the
 *  ETHRegistrar. Both are paid in an ERC-20. */
export const ethRenewerV1Map = new Map<number, Address>([
  [mainnet.id, "0x56c447F308F463A01121C41E72b0E7e7557fCb68"],
  [sepolia.id, "0xf2ece44980778966b8a0FccB3A9E339440f6e045"],
]);

/** ENSv2's VerifiableFactory: deploys a resolver proxy at an address
 *  predictable from its deployer and salt. */
export const verifiableFactoryMap = new Map<number, Address>([
  [mainnet.id, "0x77510ba162dfeA3d8989E3f0928a691B345730D2"],
  [sepolia.id, "0xDa70306C98E97eCe36F997a21368e53298572991"],
]);

/** ENSv2's PermissionedResolver implementation, behind every resolver the
 *  factory deploys for a user (verified on Sourcify for mainnet). */
export const permissionedResolverImplMap = new Map<number, Address>([
  [mainnet.id, "0x565b0F456a04Ac9b48758190e90030623Cff57C5"],
  [sepolia.id, "0x115eb53F0c60696633855F90b138178Fb40b2b2C"],
]);

/** ENSv2's UserRegistry implementation: the registry of an ENSv2 name's
 *  subnames, deployed per name through the VerifiableFactory. */
export const userRegistryImplMap = new Map<number, Address>([
  [mainnet.id, "0xC927bCaA77cd7bE283518760896Be0CF3Cfbe08d"],
  [sepolia.id, "0x9BD8a88719068D09ecee662f36C0E3856708366a"],
]);

/** ENSv2's migration controllers: a v1 .eth name moves to ENSv2 when its
 *  owner transfers it to one, with the migration data. Unwrapped names and
 *  wrapped names that can still be unwrapped go to the unlocked one; locked
 *  wrapped names (CANNOT_UNWRAP burned) to the locked one. */
export const unlockedMigrationControllerMap = new Map<number, Address>([
  [mainnet.id, "0xaB821Ca676CF2e0790Fa273526a165CFa86aEB64"],
  [sepolia.id, "0x2a35B94DF22cc7354570be2284655E2CDC0e64A2"],
]);
export const lockedMigrationControllerMap = new Map<number, Address>([
  [mainnet.id, "0x3ceA18620883a69ED349B23328A3B6302598e51A"],
  [sepolia.id, "0x6029a063d69b09D23c52a754a90E4FE43aDac3A8"],
]);

/** The token ETHRegistrar is paid in when none is given: USDC (DAI is the
 *  other one it accepts; it takes no ETH). */
export const defaultPaymentTokenMap = new Map<number, Address>([
  [mainnet.id, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
  [sepolia.id, "0x240b0316Df57887DBBE58b586508b19e633a14aa"],
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
      `ens: ${label} is not available on ${chainLabel(chainId)}; supported chains: mainnet (1), sepolia (11155111)`,
    );
  }
  return address;
}
