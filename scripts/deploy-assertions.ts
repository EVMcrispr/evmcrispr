#!/usr/bin/env bun
// Deploys EVMcrispr's assertions contracts (core, Operations, Collections,
// Expressions) on a chain, at the addresses the SDK reads them from, through
// the CREATE2 proxy. The creation code and salts are the contracts repo's
// deployment modules (website/src/lib/*-deployment.ts), located by
// ASSERTIONS_REPO (default ../Assertions); anvil #0 sends, so this is for
// devnets only.
//
//   bun scripts/deploy-assertions.ts --rpc https://rpc1.hegota.ethrex.xyz
import { resolve } from "node:path";
import {
  COLLECTIONS_ADDRESS,
  CORE_ADDRESS,
  EXPRESSIONS_ADDRESS,
  OPERATIONS_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import {
  type Address,
  concat,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  isAddressEqual,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ASSERTIONS_RUNTIME_HASH,
  COLLECTIONS_RUNTIME_HASH,
  EXPRESSIONS_RUNTIME_HASH,
  OPERATIONS_RUNTIME_HASH,
} from "../packages/test-utils/src/onchain/assertions-bytecode";

export const ASSERTIONS_REPO = resolve(
  process.env.ASSERTIONS_REPO ?? resolve(import.meta.dir, "../../Assertions"),
);
export const CREATE2_PROXY: Address =
  "0x4e59b44847b379578588920cA78FbF26c0B4956C";
/** Anvil's #0: a public key, devnets only. */
const DEPLOYER_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const CONTRACTS = [
  {
    prefix: "ASSERTIONS",
    file: "assertions",
    sdk: CORE_ADDRESS,
    runtimeHash: ASSERTIONS_RUNTIME_HASH,
  },
  {
    prefix: "OPERATIONS",
    file: "operations",
    sdk: OPERATIONS_ADDRESS,
    runtimeHash: OPERATIONS_RUNTIME_HASH,
  },
  {
    prefix: "COLLECTIONS",
    file: "collections",
    sdk: COLLECTIONS_ADDRESS,
    runtimeHash: COLLECTIONS_RUNTIME_HASH,
  },
  {
    prefix: "EXPRESSIONS",
    file: "expressions",
    sdk: EXPRESSIONS_ADDRESS,
    runtimeHash: EXPRESSIONS_RUNTIME_HASH,
  },
] as const;

export interface Deployment {
  name: string;
  address: Address;
  salt: Hex;
  creation: Hex;
  runtimeHash: Hex;
}

export const deployCalldata = (salt: Hex, creation: Hex): Hex =>
  concat([salt, creation]);

/** The four deployments, in order, each refused if its address is not the
 *  SDK's. */
export async function loadDeployments(repo: string): Promise<Deployment[]> {
  const out: Deployment[] = [];
  for (const c of CONTRACTS) {
    const m = (await import(
      resolve(repo, `website/src/lib/${c.file}-deployment.ts`)
    )) as Record<string, unknown>;
    const address = m[`${c.prefix}_ADDRESS`] as Address;
    if (!isAddressEqual(address, c.sdk))
      throw new Error(
        `${c.file}: the contracts repo deploys it at ${address}, but the SDK reads it at ${c.sdk}`,
      );
    out.push({
      name: c.file,
      address,
      salt: m[`${c.prefix}_SALT`] as Hex,
      creation: m[`${c.prefix}_CREATION_BYTECODE`] as Hex,
      runtimeHash: c.runtimeHash,
    });
  }
  return out;
}

async function main(rpc: string) {
  const reader = createPublicClient({ transport: http(rpc) });
  const chain = defineChain({
    id: await reader.getChainId(),
    name: "target",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const wallet = createWalletClient({
    account: privateKeyToAccount(DEPLOYER_KEY),
    chain,
    transport: http(rpc),
  });
  if (!(await reader.getCode({ address: CREATE2_PROXY }))?.length)
    throw new Error(`${rpc} has no CREATE2 proxy at ${CREATE2_PROXY}`);
  for (const d of await loadDeployments(ASSERTIONS_REPO)) {
    let code = await reader.getCode({ address: d.address });
    if (code?.length) console.log(`${d.name}: already at ${d.address}`);
    else {
      // The chain's own estimate: a chain pricing state growth (EIP-8037,
      // the frame devnets) needs several times the plain-chain gas.
      const data = deployCalldata(d.salt, d.creation);
      const estimate = await reader.estimateGas({
        account: wallet.account,
        to: CREATE2_PROXY,
        data,
      });
      const hash = await wallet.sendTransaction({
        to: CREATE2_PROXY,
        data,
        gas: (estimate * 101n) / 100n,
      });
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error(`${d.name}: the deployment ${hash} reverted`);
      code = await reader.getCode({ address: d.address });
      console.log(`${d.name}: deployed at ${d.address} (${hash})`);
    }
    if (!code?.length || keccak256(code) !== d.runtimeHash)
      throw new Error(
        `${d.name}: the code at ${d.address} is not the runtime EVMcrispr expects (${d.runtimeHash})`,
      );
    console.log(`${d.name}: runtime matches ${d.runtimeHash}`);
  }
}

if (import.meta.main) {
  const i = process.argv.indexOf("--rpc");
  const rpc = i > 0 ? process.argv[i + 1] : undefined;
  if (!rpc) {
    console.error("usage: deploy-assertions.ts --rpc <url>");
    process.exit(2);
  }
  await main(rpc).catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
