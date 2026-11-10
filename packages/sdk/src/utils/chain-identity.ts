import { http } from "viem";
import { registeredChain } from "./chains";

/** Anything that answers JSON-RPC: a viem transport's or a wallet's
 *  `request`. */
export type RpcRequest = (args: {
  method: string;
  params?: unknown[];
}) => Promise<unknown>;

/** How long a node gets to say what its block 0 is. */
const BLOCK_ZERO_TIMEOUT_MS = 5_000;

/** Block 0's hash as `request`'s node has it, or undefined when it does
 *  not say in time. */
async function blockZero(request: RpcRequest): Promise<string | undefined> {
  const timeout = new Promise<undefined>((resolve) =>
    setTimeout(resolve, BLOCK_ZERO_TIMEOUT_MS),
  );
  const read = request({
    method: "eth_getBlockByNumber",
    params: ["0x0", false],
  })
    .then((block) => {
      const hash = (block as { hash?: unknown } | null)?.hash;
      return typeof hash === "string" ? hash.toLowerCase() : undefined;
    })
    .catch(() => undefined);
  return Promise.race([read, timeout]);
}

/** The declared RPC's block 0, read once per chain id. */
const references = new Map<number, Promise<string | undefined>>();

function reference(chainId: number, rpcUrl: string) {
  let ref = references.get(chainId);
  if (!ref) {
    ref = blockZero(http(rpcUrl, { retryCount: 0 })({}).request as RpcRequest);
    references.set(chainId, ref);
    // An unreachable node is asked again next time, not remembered.
    ref.then((hash) => {
      if (!hash) references.delete(chainId);
    });
  }
  return ref;
}

/**
 * Which chain a node with this id is, as far as the declarations go:
 *
 * - `"declared"`: the registered chain (its id is its own, or the id is
 *   shared and the node's block 0 is the declared RPC's);
 * - `"other"`: the id is shared and this node is another network on it (a
 *   local devnet on 1337, a Kurtosis devnet on 3151908), or the declared
 *   RPC could not be read to tell;
 * - `"undeclared"`: no module or host declares the id.
 *
 * A node at the declared RPC itself is the declared chain without asking.
 */
export async function identifyChain(
  chainId: number,
  node: RpcRequest | { url: string },
): Promise<"declared" | "other" | "undeclared"> {
  const def = registeredChain(chainId);
  if (!def) return "undeclared";
  if (!def.sharedId) return "declared";
  if ("url" in node && node.url === def.rpcUrl) return "declared";
  const request =
    "url" in node
      ? (http(node.url, { retryCount: 0 })({}).request as RpcRequest)
      : node;
  const [theirs, ours] = await Promise.all([
    blockZero(request),
    reference(chainId, def.rpcUrl),
  ]);
  return theirs && ours && theirs === ours ? "declared" : "other";
}

/** Forgets the declared RPCs' block 0 (tests, or after a devnet reset). */
export function forgetChainIdentities(): void {
  references.clear();
}

/**
 * Whether two nodes are the same chain, by their block 0: `"unknown"` when
 * either does not say (a wallet that does not answer the read is not
 * refused for it).
 */
export async function sameChain(
  a: RpcRequest,
  b: RpcRequest,
): Promise<"same" | "different" | "unknown"> {
  const [x, y] = await Promise.all([blockZero(a), blockZero(b)]);
  if (!x || !y) return "unknown";
  return x === y ? "same" : "different";
}
