/**
 * Hosted EEZ devnet used by the integration tests. Endpoints come from the
 * module's chain declarations, overridable per chain with
 * EVMCRISPR_RPC_URL_<id> (the CLI's knob) so a local Kurtosis enclave works
 * too; set EEZ_DEVNET=0 to force-skip.
 */

import { toViemChain } from "@evmcrispr/sdk";
import type {
  Account,
  Address,
  Chain,
  Hex,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { eezBaseAbi } from "../src/abis";
import { chains } from "../src/chains";
import { supportsExecuteBatch } from "../src/utils/eez";

export const L1_ID = 7331;
export const L2_ID = 6290;

const url = (id: number) =>
  process.env[`EVMCRISPR_RPC_URL_${id}`] ??
  chains.find((c) => c.id === id)!.rpcUrl;

export const L1_RPC = url(L1_ID);
export const L2_RPC = url(L2_ID);

export const l1Chain = toViemChain({ ...chains[0], rpcUrl: L1_RPC });
export const l2Chain = toViemChain({ ...chains[1], rpcUrl: L2_RPC });

/** Dedicated test identity (never a shared hardhat key), funded on demand. */
export const TEST_KEY = keccak256(
  stringToHex("evmcrispr-eez-devnet-test-account"),
);
export const testAccount = privateKeyToAccount(TEST_KEY);

/** Anvil #1 — pre-funded on both devnet chains (#0 is the devnet operator's
 *  busy key, whose nonce races); only used to top up. */
const FAUCET_KEY: Hex =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

/** `contract Value { uint256 public value; function setValue(uint256 v) external { value = v; } }` (solc 0.8.28). */
export const VALUE_BYTECODE: Hex =
  "0x6080604052348015600e575f5ffd5b506101268061001c5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c80633fa4f2451460345780635524107714604e575b5f5ffd5b603a6066565b60405160459190608a565b60405180910390f35b606460048036038101906060919060ca565b606b565b005b5f5481565b805f8190555050565b5f819050919050565b6084816074565b82525050565b5f602082019050609b5f830184607d565b92915050565b5f5ffd5b60ac816074565b811460b5575f5ffd5b50565b5f8135905060c48160a5565b92915050565b5f6020828403121560dc5760db60a1565b5b5f60e78482850160b8565b9150509291505056fea2646970667358221220b15584687b4b94cba9d00a825b2e5854daaa6a6565b46a29c873db5c1a304c3964736f6c634300081c0033";

async function chainIdAt(rpc: string): Promise<number | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      const json = (await res.json()) as { result?: string };
      if (json.result) return Number(json.result);
    } catch {
      // flaky endpoint — retry
    }
  }
  return undefined;
}

async function probe(): Promise<boolean> {
  if (process.env.EEZ_DEVNET === "0") return false;
  const [l1, l2] = await Promise.all([chainIdAt(L1_RPC), chainIdAt(L2_RPC)]);
  const up = l1 === L1_ID && l2 === L2_ID;
  if (!up) console.warn("Skipping EEZ devnet tests: endpoints unreachable");
  return up;
}

export const devnet = await probe();

export const l1: PublicClient = createPublicClient({
  chain: l1Chain,
  transport: http(L1_RPC),
});
export const l2: PublicClient = createPublicClient({
  chain: l2Chain,
  transport: http(L2_RPC),
});

export const l1Wallet: WalletClient<Transport, Chain, Account> =
  createWalletClient({
    account: testAccount,
    chain: l1Chain,
    transport: http(L1_RPC),
  });
export const l2Wallet: WalletClient<Transport, Chain, Account> =
  createWalletClient({
    account: testAccount,
    chain: l2Chain,
    transport: http(L2_RPC),
  });

/** Top an account (the test identity by default) up on both chains when it runs low. */
export async function ensureFunded(
  address: Address = testAccount.address,
  minimum = parseEther("1"),
): Promise<void> {
  const faucet = privateKeyToAccount(FAUCET_KEY);
  for (const [client, chain, rpc] of [
    [l1, l1Chain, L1_RPC],
    [l2, l2Chain, L2_RPC],
  ] as const) {
    const balance = await client.getBalance({ address });
    if (balance >= minimum) continue;
    const wallet = createWalletClient({
      account: faucet,
      chain,
      transport: http(rpc),
    });
    const hash = await wallet.sendTransaction({
      to: address,
      value: parseEther("50"),
    });
    await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  }
}

/** Deploy a fresh `Value` contract with the test account. */
export async function deployValue(
  wallet: WalletClient<Transport, Chain, Account>,
  client: PublicClient,
): Promise<Address> {
  const hash = await wallet.deployContract({
    abi: [],
    bytecode: VALUE_BYTECODE,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 60_000,
  });
  if (!receipt.contractAddress) throw new Error("Value deployment failed");
  return receipt.contractAddress;
}

/** Whether the cross-chain proxies on a chain carry `executeBatch`, by
 *  looking at the code of the proxy standing in for `original` (from
 *  rollup `originalRollupId`) there; false while nobody has created that
 *  proxy. The devnet lags the eez-core-protocol change that adds it;
 *  batch tests that reach the far side wait for that. */
export async function proxySupportsBatch(
  client: PublicClient,
  registry: Address,
  original: Address,
  originalRollupId: bigint,
): Promise<boolean> {
  const proxy = await client.readContract({
    address: registry,
    abi: eezBaseAbi,
    functionName: "computeCrossChainProxyAddress",
    args: [original, originalRollupId],
  });
  const code = await client.getCode({ address: proxy });
  return !!code && code !== "0x" && supportsExecuteBatch(code);
}
