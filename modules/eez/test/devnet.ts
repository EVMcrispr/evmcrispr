/**
 * Hosted EEZ devnet used by the integration tests. Endpoints come from the
 * module's chain declarations, overridable per chain with
 * EVMCRISPR_RPC_URL_<id> (the CLI's knob) so a local Kurtosis enclave works
 * too. The tests skip when EEZ_DEVNET_FUNDER_KEY (funds the test account on
 * both chains) is unset, as in CI; set EEZ_DEVNET=0 to force-skip.
 */

import type { ChainDef } from "@evmcrispr/sdk";
import { isChainGatewayDef, toViemChain } from "@evmcrispr/sdk";
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
import { gnosisChiado } from "viem/chains";
import { eezBaseAbi } from "../src/abis";
import { chains } from "../src/chains";
import { EEZ_CHAINS } from "../src/constants";
import { supportsExecuteBatch } from "../src/utils/eez";

export const L1_ID = 10200;
export const L2_ID = 699169;
/** The rollup's id in the registries (not its chain id). */
export const L2_ROLLUP_ID = EEZ_CHAINS[L2_ID].rollupId;

// L1 is Gnosis Chiado, which the module does not declare (viem knows it).
// The tests reach it through the EEZ composer, which also takes the
// cross-chain transactions sent from L1.
const L1_DEFAULT_RPC = "https://chiadox.eez.dev/composer/l1";
const l2Def = chains.find(
  (c): c is ChainDef => c.id === L2_ID && !isChainGatewayDef(c),
)!;

export const L1_RPC =
  process.env[`EVMCRISPR_RPC_URL_${L1_ID}`] ?? L1_DEFAULT_RPC;
export const L2_RPC = process.env[`EVMCRISPR_RPC_URL_${L2_ID}`] ?? l2Def.rpcUrl;

// Reads (receipts above all) go to the chains' own RPCs: the composer
// fronts forward them, and a receipt read through a front sometimes never
// comes back although the transaction is mined. Transactions still go out
// through the fronts. Overridable with EVMCRISPR_READ_RPC_URL_<id>.
export const L1_READ_RPC =
  process.env[`EVMCRISPR_READ_RPC_URL_${L1_ID}`] ??
  (process.env[`EVMCRISPR_RPC_URL_${L1_ID}`]
    ? L1_RPC
    : "https://chiadox.eez.dev/rpc/l1");
export const L2_READ_RPC =
  process.env[`EVMCRISPR_READ_RPC_URL_${L2_ID}`] ??
  (process.env[`EVMCRISPR_RPC_URL_${L2_ID}`]
    ? L2_RPC
    : "https://chiadox.eez.dev/rpc/l2");

export const l1Chain: Chain = {
  ...gnosisChiado,
  rpcUrls: { default: { http: [L1_RPC] } },
};
export const l2Chain = toViemChain({ ...l2Def, rpcUrl: L2_RPC });

/** Dedicated test identity (never a shared hardhat key), funded on demand. */
export const TEST_KEY = keccak256(
  stringToHex("evmcrispr-eez-devnet-test-account"),
);
export const testAccount = privateKeyToAccount(TEST_KEY);

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
  // Without the funder key the test account cannot be topped up on Chiado,
  // so the devnet tests would fail on funds rather than on what they test
  // (CI does not have the key).
  if (!process.env.EEZ_DEVNET_FUNDER_KEY) {
    console.warn("Skipping EEZ devnet tests: EEZ_DEVNET_FUNDER_KEY is not set");
    return false;
  }
  const [l1, l2] = await Promise.all([chainIdAt(L1_RPC), chainIdAt(L2_RPC)]);
  const up = l1 === L1_ID && l2 === L2_ID;
  if (!up) console.warn("Skipping EEZ devnet tests: endpoints unreachable");
  return up;
}

export const devnet = await probe();

export const l1: PublicClient = createPublicClient({
  chain: l1Chain,
  transport: http(L1_READ_RPC),
});
export const l2: PublicClient = createPublicClient({
  chain: l2Chain,
  transport: http(L2_READ_RPC),
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

/** Top an account (the test identity by default) up on both chains when it
 *  runs low, from EEZ_DEVNET_FUNDER_KEY: a local key funded by hand with a
 *  little Chiado xDAI, part of it bridged to the rollup in the ChiadoX
 *  dashboard (the rollup has no pre-funded key). Top-ups stay small: a
 *  plain transaction costs next to nothing, a cross-chain one about
 *  0.0004 xDAI in settlement fees. */
export async function ensureFunded(
  address: Address = testAccount.address,
  minimum = parseEther("0.005"),
): Promise<void> {
  const funder = process.env.EEZ_DEVNET_FUNDER_KEY as Hex | undefined;
  for (const [client, chain, rpc, min, topUp] of [
    [l1, l1Chain, L1_RPC, parseEther("0.005"), parseEther("0.02")],
    [l2, l2Chain, L2_RPC, minimum, parseEther("0.01")],
  ] as const) {
    const key = funder;
    const balance = await client.getBalance({ address });
    if (balance >= min) continue;
    if (!key)
      throw new Error(
        `${address} needs ${chain.name} funds: set EEZ_DEVNET_FUNDER_KEY to a key holding Chiado xDAI on both chains`,
      );
    const wallet = createWalletClient({
      account: privateKeyToAccount(key),
      chain,
      transport: http(rpc),
    });
    const hash = await wallet.sendTransaction({ to: address, value: topUp });
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
