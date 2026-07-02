import { ErrorException } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { parseAbi, zeroAddress } from "viem";

/**
 * ETHRegistrarController (2025 controller, same ABI on mainnet and sepolia),
 * verified via Sourcify for 0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547 and
 * 0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968.
 */
export const controllerAbi = parseAbi([
  "struct Registration { string label; address owner; uint256 duration; bytes32 secret; address resolver; bytes[] data; uint8 reverseRecord; bytes32 referrer; }",
  "struct Price { uint256 base; uint256 premium; }",
  "function makeCommitment(Registration registration) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(Registration registration) payable",
  "function rentPrice(string label, uint256 duration) view returns (Price price)",
  "function minCommitmentAge() view returns (uint256)",
]);

// reverseRecord bitfield in the 2025 controller
const REVERSE_RECORD_ETHEREUM_BIT = 1;

export interface Registration {
  label: string;
  owner: Address;
  duration: bigint;
  secret: Hex;
  resolver: Address;
  data: Hex[];
  reverseRecord: number;
  referrer: Hex;
}

export function buildRegistration(
  label: string,
  owner: Address,
  duration: bigint | number,
  opts: Record<string, any>,
  defaultResolver: Address = zeroAddress,
): Registration {
  const secret = opts.secret;
  if (!secret) {
    throw new ErrorException(
      'missing --secret; generate one once (e.g. @id("my secret phrase")) and reuse the same value across the commit and reveal steps',
    );
  }
  return {
    label,
    owner,
    duration: BigInt(duration),
    secret,
    resolver: opts.resolver ?? defaultResolver,
    data: [],
    reverseRecord: opts["reverse-record"] ? REVERSE_RECORD_ETHEREUM_BIT : 0,
    referrer:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
  };
}
