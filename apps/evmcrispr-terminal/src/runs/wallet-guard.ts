import { classifyError } from "@evmcrispr/core";
import {
  createWalletClient,
  type EIP1193RequestFn,
  type Transport,
  type WalletClient,
} from "viem";

/** Requests that only read: which chain and account the wallet is on, the
 *  chain's state, how a batch it was given is doing. They prompt for
 *  nothing and are allowed at any time. */
const isRead = (method: string) =>
  /^eth_(chainId|accounts|call|estimateGas|gasPrice|blockNumber|maxPriorityFeePerGas|feeHistory|blobBaseFee|get[A-Z]\w*)$/.test(
    method,
  ) ||
  /^wallet_(getCallsStatus|getCapabilities|getPermissions)$/.test(method) ||
  method === "net_version" ||
  method === "web3_clientVersion";

/** Requests that put nothing on a chain and sign nothing when the wallet
 *  grants them. Every other request counts as sent once it is granted:
 *  what cannot be told apart is treated as sent. */
const QUIET = new Set([
  "eth_requestAccounts",
  "wallet_requestPermissions",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "wallet_watchAsset",
]);

/** A wallet request was not made: the run's gate had not let it through. */
export class NotPassed extends Error {
  constructor(method: string) {
    super(
      `The wallet request "${method}" was held back: not passed by the run`,
    );
    this.name = "NotPassed";
  }
}

const MAX_DEPTH = 8;

export interface WalletGuard {
  /** The wallet as a run may use it. */
  client: WalletClient;
  /** Whether `error` is, or wraps, a refusal the wallet itself gave to a
   *  request made through `client`. An error that merely carries code
   *  4001 (an RPC's, a module's, a later step's) is not one. */
  isRefusal(error: unknown): boolean;
  /** Whether `error` is, or wraps, a request this guard did not make. */
  isHeldBack(error: unknown): boolean;
}

/**
 * A run's only way to the wallet: a wallet client whose every request, of
 * whatever kind and whichever code makes it, passes here on its way to
 * the wallet. A request that is not a read is made only if the run's gate
 * allows one at that very moment, so gating is what happens by default,
 * and nothing is awaited between that check and the wallet.
 *
 * This is also the one place two things can be known for certain:
 *  - that a refusal came from the wallet, for that request;
 *  - that a request was granted, so something may have gone out
 *    (`submitted`), and asking again could send it twice.
 */
export function guardWallet(
  wallet: WalletClient,
  hooks: { submitted(): void; allows(): boolean },
): WalletGuard {
  const refusals = new WeakSet<object>();

  const request = async (args: { method: string; params?: unknown }) => {
    const read = isRead(args.method);
    if (!read && !hooks.allows()) throw new NotPassed(args.method);
    try {
      const result = await (wallet.request as EIP1193RequestFn)(args as never);
      if (!read && !QUIET.has(args.method)) hooks.submitted();
      return result;
    } catch (error) {
      if (
        !read &&
        error !== null &&
        typeof error === "object" &&
        classifyError(error).kind === "rejected"
      )
        refusals.add(error);
      throw error;
    }
  };

  // The wallet's own client already shapes requests and errors: this one
  // adds nothing but the passage above (no retries, no rewrapping).
  const transport: Transport = () => ({
    config: {
      key: "guarded",
      name: "Guarded wallet",
      type: "custom",
      request: request as EIP1193RequestFn,
      retryCount: 0,
      retryDelay: 0,
    },
    request: request as EIP1193RequestFn,
  });
  const client = createWalletClient({
    account: wallet.account,
    chain: wallet.chain,
    transport,
  });

  /** Whether `error` or one of its causes is `wanted`. */
  const carries = (error: unknown, wanted: (level: object) => boolean) => {
    let level = error;
    for (let depth = 0; level && depth < MAX_DEPTH; depth++) {
      if (typeof level === "object" && wanted(level)) return true;
      level = (level as { cause?: unknown }).cause;
    }
    return false;
  };

  return {
    client,
    isRefusal: (error) => carries(error, (level) => refusals.has(level)),
    isHeldBack: (error) =>
      carries(error, (level) => level instanceof NotPassed),
  };
}
