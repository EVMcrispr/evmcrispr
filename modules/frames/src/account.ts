// Sending from a FrameAccount (contracts/FrameAccount.sol): its owner signs
// the transaction's signature hash as EIP-712 typed data, and the account's
// VERIFY code checks that signature. The EIP-8141 part (frames, fees, the
// ARBITRARY entry, the gateway) is viem-frames'; this is the account's.
import {
  altMempoolDevnet,
  type FrameLogLevel,
  type FrameSpecLike,
  type FrameTransactionReceipt,
  printable,
  refusalText,
  sendFrameTransactionWithArbitrarySignature,
} from "@evmcrispr/viem-frames";
import {
  type Address,
  type Chain,
  type Hash,
  type Hex,
  isAddress,
  isAddressEqual,
  isHex,
  recoverTypedDataAddress,
  size,
  type Transport,
  type TypedDataDefinition,
  type WalletClient,
} from "viem";

/** The EIP-712 domain name a FrameAccount checks its owner's signature under. */
export const FRAME_ACCOUNT_DOMAIN_NAME = "EVMcrispr Frame Account";

const FRAME_ACCOUNT_TYPES = {
  FrameTransaction: [{ name: "sigHash", type: "bytes32" }],
} as const;

/** Wallet text in an error: escaped and cut. */
const TEXT_MAX = 300;

/**
 * The typed data a FrameAccount's owner signs to authorize one frame
 * transaction: the account, the chain and the transaction's signature hash.
 */
export function frameAccountTypedData(
  account: Address,
  sigHash: Hex,
  chainId: number,
): TypedDataDefinition<typeof FRAME_ACCOUNT_TYPES, "FrameTransaction"> {
  return {
    domain: {
      name: FRAME_ACCOUNT_DOMAIN_NAME,
      version: "1",
      chainId,
      verifyingContract: account,
    },
    types: FRAME_ACCOUNT_TYPES,
    primaryType: "FrameTransaction",
    message: { sigHash },
  };
}

/**
 * Sends a frame transaction from a FrameAccount whose owner authorizes it
 * with an EIP-712 signature, from any wallet: a JSON-RPC account (MetaMask,
 * a wallet RPC) or a local one. The wallet must be the owner; it signs
 * `frameAccountTypedData(account, sigHash)` and never sends: everything
 * else goes through `transport` (the gateway), never through the wallet's
 * RPC.
 */
export async function sendAccountFrameTransaction({
  wallet,
  account,
  owner,
  frames,
  mempool,
  transport,
  onLog,
  receiptTimeoutMs,
  maxFeePerGasCap,
  signWith,
  signal,
  chain = altMempoolDevnet,
  waitForReceipt = true,
}: {
  wallet: WalletClient;
  /** The FrameAccount: `tx.sender`. */
  account: Address;
  /** The account's owner: must be the wallet's address. */
  owner: Address;
  frames: readonly FrameSpecLike[];
  mempool: "alt" | "canonical";
  /** The chain's RPC (the gateway on the Alt-mempool devnet); the chain's own by default. */
  transport?: Transport;
  onLog?: (line: string, level: FrameLogLevel) => void;
  receiptTimeoutMs?: number;
  /** Refuses, before signing, fees above this (wei per gas; 10 gwei by default): the wallet never sees them. */
  maxFeePerGasCap?: bigint;
  /** Wraps the one signature request with a description of the transaction (a host that confirms signatures shows it). */
  signWith?: <T>(description: string, sign: () => Promise<T>) => Promise<T>;
  /** Checked once the wallet has signed: aborted, nothing is submitted. */
  signal?: AbortSignal;
  /** The frame chain the account lives on; altMempoolDevnet by default. */
  chain?: Chain;
  /** false: return once the mempool admits it (a chain that never mines). */
  waitForReceipt?: boolean;
}): Promise<{ hash: Hash; receipt?: FrameTransactionReceipt }> {
  // Both go into every line below: refused here unless they are addresses.
  for (const [name, value] of [
    ["account", account],
    ["owner", owner],
  ] as const)
    if (typeof value !== "string" || !isAddress(value, { strict: false }))
      throw new Error(
        `The frame account's ${name} ${printable(value, 60)} is not an address`,
      );

  const walletAddress =
    wallet.account?.address ??
    (
      await wallet.getAddresses().catch((error: unknown) => {
        throw new Error(
          `The wallet gave no account: ${printable(refusalText(error), TEXT_MAX)}`,
          { cause: error },
        );
      })
    )[0];
  if (
    typeof walletAddress !== "string" ||
    !isAddress(walletAddress, { strict: false })
  )
    throw new Error(
      walletAddress === undefined
        ? `The wallet has no account: connect the account's owner ${owner}`
        : `The wallet's account ${printable(walletAddress, 60)} is not an address: connect the account's owner ${owner}`,
    );
  if (!isAddressEqual(walletAddress, owner))
    throw new Error(
      `The connected wallet is ${printable(walletAddress, 60)}, but the account ${account} is owned by ${owner}: connect ${owner} to sign`,
    );

  return sendFrameTransactionWithArbitrarySignature({
    sender: account,
    frames,
    mempool,
    transport,
    onLog,
    receiptTimeoutMs,
    maxFeePerGasCap,
    signWith,
    signal,
    chain,
    waitForReceipt,
    async sign(sigHash) {
      const typedData = frameAccountTypedData(account, sigHash, chain.id);
      const signature: unknown = await wallet
        .signTypedData({
          account: wallet.account ?? walletAddress,
          ...typedData,
        })
        .catch((error: unknown) => {
          throw new Error(
            `The wallet did not sign: ${printable(refusalText(error), TEXT_MAX)}`,
            { cause: error },
          );
        });
      if (
        typeof signature !== "string" ||
        !isHex(signature) ||
        size(signature) !== 65
      )
        throw new Error(
          `The wallet did not return a 65-byte signature (it returned ${printable(signature, 140)}): nothing was sent`,
        );
      const signer = await recoverTypedDataAddress({ ...typedData, signature });
      if (!isAddressEqual(signer, owner))
        throw new Error(
          `The signature was not signed by the owner ${owner} (it recovers to ${signer}): nothing was sent`,
        );
      return signature;
    },
  });
}
