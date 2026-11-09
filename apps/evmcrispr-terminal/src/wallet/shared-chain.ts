// Chains whose id other networks share (experimental only): the alt-mempool
// devnet's 1337 is also every local devnet's, the Hegota devnet's 3151908
// Kurtosis'. A wallet that already has a network on that id ("Localhost
// 8545") switches to that one, and the script's ordinary transactions
// would go there. So the declared RPC is offered to the wallet before
// switching, and the wallet's chain is checked to be the declared one
// before anything is sent on it.
import { classifyError } from "@evmcrispr/core";
import type { Action, ChainDef } from "@evmcrispr/sdk";
import { printable } from "@evmcrispr/viem-frames";
import {
  createPublicClient,
  http,
  type Transport,
  type WalletClient,
} from "viem";
import { sharedChain } from "../config/rpc";

const RETRY_MS = 2_000;
/** Wallets that do not know the request: the check alone decides. */
const UNSUPPORTED = new Set([4200, -32601]);

/** The shared-id chain a change of the wallet's chain to `chainId` is
 *  checked against, if any. */
export const sharedChainOf = (chainId: number): ChainDef | undefined =>
  sharedChain(chainId);

/** The chain a `wallet_switchEthereumChain` request asks for. */
export const switchTarget = (action: Action): number | undefined => {
  if (!("type" in action) || action.type !== "wallet") return undefined;
  if (action.method !== "wallet_switchEthereumChain") return undefined;
  const id = Number((action.params?.[0] as { chainId?: unknown })?.chainId);
  return Number.isSafeInteger(id) ? id : undefined;
};

interface Block {
  number: bigint;
  hash: string;
}

/** A block as a node answered it, or null for one it does not have (or an
 *  answer that is not one). */
const asBlock = (value: unknown): Block | null => {
  const { number, hash } = (value ?? {}) as Record<string, unknown>;
  if (typeof number !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(number))
    return null;
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
    return null;
  return { number: BigInt(number), hash: hash.toLowerCase() };
};

const tag = (n: bigint | "latest") =>
  n === "latest" ? n : `0x${n.toString(16)}`;

const messageOf = (error: unknown) =>
  printable(
    (error as { shortMessage?: unknown })?.shortMessage ??
      (error instanceof Error ? error.message : error),
    200,
  );

/** A wallet's refusal, or a request the run held back, goes on as it is:
 *  the run pauses on it. Anything else is told in the terminal's words,
 *  the wallet's own text escaped. */
const rethrow = (what: string, error: unknown): never => {
  if (
    classifyError(error).kind === "rejected" ||
    (error as { name?: unknown } | null)?.name === "NotPassed"
  )
    throw error;
  throw new Error(`${what}: ${messageOf(error)}`, { cause: error });
};

/**
 * Brings `wallet` to `chain`, or throws. When the wallet's chain is not
 * already that one, its declared RPC is added for the id
 * (`wallet_addEthereumChain`), then switched to; then the wallet's latest
 * block, as its own RPC reports it, must be the declared RPC's block of the
 * same number. A refusal in the wallet is thrown as the wallet gave it.
 *
 * Callers use it for the chains `sharedChainOf` gives, and nowhere else.
 */
export async function ensureSharedChain(
  wallet: WalletClient,
  chain: ChainDef,
  options: {
    /** How the declared RPC is read; `http(chain.rpcUrl)` by default. */
    transport?: Transport;
    /** How long a declared RPC behind the wallet is given to catch up. */
    retryMs?: number;
  } = {},
): Promise<void> {
  const CHAIN_ID = chain.id;
  const node = createPublicClient({
    transport: options.transport ?? http(chain.rpcUrl),
  });
  type Ask = (args: { method: string; params: unknown[] }) => Promise<unknown>;
  /** Block `n` as `ask`'s node has it. */
  const read =
    (ask: Ask, from: string) =>
    async (n: bigint | "latest"): Promise<Block | null> => {
      try {
        return asBlock(
          await ask({
            method: "eth_getBlockByNumber",
            params: [tag(n), false],
          }),
        );
      } catch (error) {
        return rethrow(`Could not read chain ${CHAIN_ID} from ${from}`, error);
      }
    };
  // The wallet is asked through its own RPC: that is where the script's
  // transactions would go.
  const ofWallet = read(wallet.request as unknown as Ask, "the wallet");
  const ofGateway = read(node.request as unknown as Ask, `the ${chain.name}`);

  /** Whether the wallet's chain is the declared RPC's. */
  const same = async (): Promise<boolean> => {
    const mine = await ofWallet("latest");
    if (!mine) return false;
    let theirs = await ofGateway(mine.number);
    if (!theirs) {
      await new Promise((done) =>
        setTimeout(done, options.retryMs ?? RETRY_MS),
      );
      theirs = await ofGateway(mine.number);
    }
    if (theirs) return theirs.hash === mine.hash;
    // The declared RPC is behind the wallet: its latest block is compared with
    // the wallet's block of that number.
    const latest = await ofGateway("latest");
    if (!latest || latest.number >= mine.number) return false;
    const atLatest = await ofWallet(latest.number);
    return atLatest?.hash === latest.hash;
  };

  const onDevnet = async () =>
    (await wallet.getChainId()) === CHAIN_ID && (await same());

  if (await onDevnet()) return;
  try {
    await wallet.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: `0x${CHAIN_ID.toString(16)}`,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency ?? {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: [chain.rpcUrl],
          ...(chain.explorerUrl && { blockExplorerUrls: [chain.explorerUrl] }),
        },
      ],
    });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code !== "number" || !UNSUPPORTED.has(code))
      rethrow(`The wallet did not add the ${chain.name}`, error);
  }
  if ((await wallet.getChainId()) !== CHAIN_ID)
    await wallet
      .switchChain({ id: CHAIN_ID })
      .catch((error) =>
        rethrow(`The wallet did not switch to the ${chain.name}`, error),
      );
  if (!(await onDevnet()))
    throw new Error(
      `Your wallet's chain ${CHAIN_ID} is not the ${chain.name}: set its RPC to ${chain.rpcUrl}`,
    );
}
