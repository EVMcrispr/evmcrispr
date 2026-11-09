import { ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { parseAbi, zeroAddress } from "viem";

/**
 * ENSv2 ETHRegistrar (ensdomains/contracts-v2, `IETHRegistrar`), the same
 * contract on mainnet and sepolia. Registration is commit/reveal; the reveal
 * pulls the price in an ERC-20 (USDC or DAI) from the sender, so the sender
 * approves the registrar first.
 */
export const ethRegistrarAbi = parseAbi([
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function isAvailable(string label) view returns (bool)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MIN_REGISTER_DURATION() view returns (uint64)",
]);

/**
 * ENSv2's renewers, as deployed (verified on Sourcify): the ETHRegistrar
 * renews ENSv2 names, ETHRenewerV1 names still on ENS v1. Both pull the price
 * in an ERC-20 from the sender, and renew a batch with one transfer.
 */
export const renewerAbi = parseAbi([
  "struct RenewData { string label; uint64 duration; bytes32 referrer; }",
  "function isRenewable(string label) view returns (bool)",
  "function getRenewPrice(string label, uint64 duration, address paymentToken) view returns (uint256)",
  "function renewBatch(RenewData[] rds, address paymentToken)",
]);

export const NO_REFERRER: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** The parameters a commitment binds, in `makeCommitment` order. */
export interface Registration {
  label: string;
  owner: Address;
  secret: Hex;
  subregistry: Address;
  resolver: Address;
  duration: bigint;
  referrer: Hex;
}

export function buildRegistration(
  label: string,
  owner: Address,
  duration: bigint | number,
  opts: Record<string, any>,
): Registration {
  const secret = opts.secret;
  if (!secret) {
    throw new ErrorException(
      'missing --secret; generate one once (e.g. @hash("my secret phrase")) and reuse the same value across the commit and reveal steps',
    );
  }
  if (opts["reverse-record"]) {
    throw new ErrorException(
      "--reverse-record is not part of an ENSv2 registration: once the name resolves to an address, set it with ens:set-primary-name",
    );
  }
  return {
    label,
    owner,
    secret,
    subregistry: opts.subregistry ?? zeroAddress,
    resolver: opts.resolver ?? zeroAddress,
    duration: BigInt(duration),
    referrer: NO_REFERRER,
  };
}

/** `makeCommitment`'s arguments, in order. */
export const commitmentArgs = (r: Registration) =>
  [
    r.label,
    r.owner,
    r.secret,
    r.subregistry,
    r.resolver,
    r.duration,
    r.referrer,
  ] as const;
