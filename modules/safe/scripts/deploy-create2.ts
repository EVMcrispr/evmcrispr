/**
 * Deploy the Safe v1.4.1 contracts the module relies on to a chain that has
 * none — a devnet, a fresh rollup — through the Arachnid CREATE2 deployer.
 *
 * Safe's canonical addresses come from the Safe Singleton Factory, which
 * only Safe's own deployer key can put on a chain. Where that factory is
 * missing, the same creation bytecode salted with zero through the
 * Arachnid deployer (present on most chains from genesis) yields a
 * different but equally deterministic set of addresses, identical on every
 * chain deployed this way. The module's per-chain address table records
 * them (`src/addresses.ts`).
 *
 * Idempotent: a contract already at its predicted address is skipped, so
 * re-running after a devnet reset only sends what is missing.
 *
 *   DEPLOYER_KEY=0x… bun scripts/deploy-create2.ts <rpc-url> [<rpc-url>…]
 */
import CompatibilityFallbackHandler from "@safe-global/safe-contracts/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json";
import MultiSend from "@safe-global/safe-contracts/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";
import MultiSendCallOnly from "@safe-global/safe-contracts/build/artifacts/contracts/libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json";
import SafeProxyFactory from "@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json";
import SafeL2 from "@safe-global/safe-contracts/build/artifacts/contracts/SafeL2.sol/SafeL2.json";
import type { Address, Hex } from "viem";
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  getCreate2Address,
  http,
  keccak256,
  padHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARACHNID_CREATE2: Address = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
const SALT: Hex = padHex("0x0", { size: 32 });

const CONTRACTS: { name: string; bytecode: Hex }[] = [
  { name: "SafeL2", bytecode: SafeL2.bytecode as Hex },
  { name: "SafeProxyFactory", bytecode: SafeProxyFactory.bytecode as Hex },
  {
    name: "CompatibilityFallbackHandler",
    bytecode: CompatibilityFallbackHandler.bytecode as Hex,
  },
  { name: "MultiSend", bytecode: MultiSend.bytecode as Hex },
  { name: "MultiSendCallOnly", bytecode: MultiSendCallOnly.bytecode as Hex },
];

export const predicted = (bytecode: Hex): Address =>
  getCreate2Address({ from: ARACHNID_CREATE2, salt: SALT, bytecode });

async function deployAll(rpcUrl: string, key: Hex): Promise<void> {
  const account = privateKeyToAccount(key);
  const client = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  const wallet = createWalletClient({
    account,
    chain: {
      id: chainId,
      name: `chain ${chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  });

  const deployer = await client.getCode({ address: ARACHNID_CREATE2 });
  if (!deployer || deployer === "0x") {
    throw new Error(
      `chain ${chainId}: the Arachnid CREATE2 deployer is not at ${ARACHNID_CREATE2}`,
    );
  }

  console.log(`chain ${chainId} (${rpcUrl}) from ${account.address}`);
  for (const { name, bytecode } of CONTRACTS) {
    const address = predicted(bytecode);
    const existing = await client.getCode({ address });
    if (existing && existing !== "0x") {
      console.log(`  ${name.padEnd(28)} ${address}  (already deployed)`);
      continue;
    }
    const hash = await wallet.sendTransaction({
      to: ARACHNID_CREATE2,
      data: concatHex([SALT, bytecode]),
    });
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: 120_000,
    });
    const code = await client.getCode({ address });
    if (receipt.status !== "success" || !code || code === "0x") {
      throw new Error(`chain ${chainId}: deploying ${name} failed (${hash})`);
    }
    console.log(
      `  ${name.padEnd(28)} ${address}  gas ${receipt.gasUsed}  runtime ${keccak256(code).slice(0, 10)}…`,
    );
  }
}

if (import.meta.main) {
  const rpcs = process.argv.slice(2);
  const key = process.env.DEPLOYER_KEY as Hex | undefined;
  if (rpcs.length === 0 || !key) {
    console.error(
      "usage: DEPLOYER_KEY=0x… bun scripts/deploy-create2.ts <rpc-url> [<rpc-url>…]",
    );
    process.exit(1);
  }
  for (const rpc of rpcs) await deployAll(rpc, key);
}
