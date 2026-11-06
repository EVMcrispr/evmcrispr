// Chain 1337 in the terminal (experimental only). It is the alt-mempool
// devnet's id and also every local devnet's: a wallet that already has a
// chain-1337 network ("Localhost 8545") switches to that one, and the
// script's ordinary transactions would go to the user's localhost. So the
// gateway is offered to the wallet before switching, and the wallet's
// chain is checked to be the devnet's before anything is sent on it.
import { classifyError } from "@evmcrispr/core";
import { type Action, isExperimentalEnabled } from "@evmcrispr/sdk";
import {
  ALT_MEMPOOL_GATEWAY,
  altMempoolDevnet,
  printable,
} from "@evmcrispr/viem-frames";
import {
  createPublicClient,
  http,
  type Transport,
  type WalletClient,
} from "viem";

const CHAIN_ID = altMempoolDevnet.id;
const RETRY_MS = 2_000;
/** Wallets that do not know the request: the check alone decides. */
const UNSUPPORTED = new Set([4200, -32601]);

/** Whether a change of the wallet's chain to `chainId` is checked here. */
export const isAltMempoolChain = (chainId: number): boolean =>
  chainId === CHAIN_ID && isExperimentalEnabled();

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
 * Brings `wallet` to the alt-mempool devnet, or throws. When the wallet's
 * chain is not already the devnet's, the gateway is added for chain 1337
 * (`wallet_addEthereumChain`), then switched to; then the wallet's latest
 * block, as its own RPC reports it, must be the gateway's block of the
 * same number. A refusal in the wallet is thrown as the wallet gave it.
 *
 * Callers use it for chain 1337 with the experimental flag on
 * (`isAltMempoolChain`), and nowhere else.
 */
export async function ensureAltMempoolChain(
  wallet: WalletClient,
  gateway: string = ALT_MEMPOOL_GATEWAY,
  options: {
    /** How the gateway is read; `http(gateway)` by default. */
    transport?: Transport;
    /** How long a gateway behind the wallet is given to catch up. */
    retryMs?: number;
  } = {},
): Promise<void> {
  const node = createPublicClient({
    transport: options.transport ?? http(gateway),
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
  const ofGateway = read(
    node.request as unknown as Ask,
    "the alt-mempool gateway",
  );

  /** Whether the wallet's chain is the gateway's. */
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
    // The gateway is behind the wallet: its latest block is compared with
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
          chainName: altMempoolDevnet.name,
          nativeCurrency: altMempoolDevnet.nativeCurrency,
          rpcUrls: [gateway],
          blockExplorerUrls: [altMempoolDevnet.blockExplorers.default.url],
        },
      ],
    });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code !== "number" || !UNSUPPORTED.has(code))
      rethrow(`The wallet did not add the ${altMempoolDevnet.name}`, error);
  }
  if ((await wallet.getChainId()) !== CHAIN_ID)
    await wallet
      .switchChain({ id: CHAIN_ID })
      .catch((error) =>
        rethrow(
          `The wallet did not switch to the ${altMempoolDevnet.name}`,
          error,
        ),
      );
  if (!(await onDevnet()))
    throw new Error(
      `Your wallet's chain 1337 is not the alt-mempool devnet: set its RPC to ${ALT_MEMPOOL_GATEWAY}`,
    );
}
