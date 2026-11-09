// Pure pieces of scripts/frame-devnet.ts: the accounts it funds, the
// chain-9 genesis it extends, and the mining devnet's Kurtosis config.
import type { ChainDef } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { chains } from "../modules/frames/src/chains";

const declared = (key: string): ChainDef => {
  const chain = chains.find((c) => c.key === key);
  if (!chain) throw new Error(`the frames module declares no chain ${key}`);
  return chain;
};

/** The quick devnet's chain, as the frames module declares it (id, RPC). */
export const QUICK_CHAIN = declared("framesQuick");
/** The mining devnet's chain, as the frames module declares it (id, RPC). */
export const MINING_CHAIN = declared("framesMining");

/** The port of a declared chain's local RPC. */
export const rpcPort = (chain: ChainDef): number => {
  const port = Number(new URL(chain.rpcUrl).port);
  if (!Number.isInteger(port) || port <= 0)
    throw new Error(`${chain.name}'s RPC ${chain.rpcUrl} has no port`);
  return port;
};

/** Anvil's and hardhat's well-known mnemonic: the keys are public. */
const DEV_MNEMONIC =
  "test test test test test test test test test test test junk";

/** 1,000,000 ETH, in wei. */
export const FUNDED_BALANCE: Hex = "0xd3c21bcecceda1000000";

/** Anvil's ten default accounts (m/44'/60'/0'/0/i), derived, never written out. */
export function devAccounts(): { address: Address; privateKey: Hex }[] {
  return Array.from({ length: 10 }, (_, i) => {
    const account = mnemonicToAccount(DEV_MNEMONIC, { addressIndex: i });
    const key = account.getHdKey().privateKey;
    if (!key) throw new Error(`no private key for account ${i}`);
    return {
      address: account.address,
      privateKey: `0x${Buffer.from(key).toString("hex")}` as Hex,
    };
  });
}

export interface GenesisJson {
  config: Record<string, unknown>;
  alloc: Record<string, { balance?: string; [field: string]: unknown }>;
  [field: string]: unknown;
}

const bare = (key: string) => key.toLowerCase().replace(/^0x/, "");

/**
 * The genesis under `chainId`, with `funded` given `balance`. Every
 * existing entry stays as it is; new keys follow the existing keys' format
 * (with or without `0x`). An account already present with another balance
 * is refused.
 */
export function extendGenesis(
  genesis: GenesisJson,
  funded: Address[],
  balance: Hex,
  chainId: number,
): GenesisJson {
  const keys = Object.keys(genesis.alloc);
  const prefixed = keys.length === 0 || keys[0]!.startsWith("0x");
  const existing = new Map(keys.map((k) => [bare(k), k]));
  const alloc = { ...genesis.alloc };
  for (const address of funded) {
    const found = existing.get(bare(address));
    if (found !== undefined) {
      if (BigInt(alloc[found]!.balance ?? 0) !== BigInt(balance))
        throw new Error(
          `${address} is already funded with a different balance in this genesis`,
        );
      continue;
    }
    const key = prefixed ? `0x${bare(address)}` : bare(address);
    alloc[key] = { code: "0x", storage: {}, balance, nonce: "0x0" };
  }
  return { ...genesis, config: { ...genesis.config, chainId }, alloc };
}

/** The pinned ethereum-package revision (generator 6.1.4+, EIP-8282 predeploys). */
export const ETHEREUM_PACKAGE =
  "github.com/ethpandaops/ethereum-package@b5b3af65248f11702216e377d0377bcd8ccf4caf";

/** EIP-8282's deposit predeploy, armed with its excess inhibitor at slot 0. */
const EIP8282_DEPOSIT = "0x0000BFF46984E3725691FA540A8C7589300D8282";
const EIP8282_DEPOSIT_CODE =
  "0x3373fffffffffffffffffffffffffffffffffffffffe1461011c575f54807fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff146102705760015460088111605257506058565b60089003015b601190600182026001905f5b5f821115607f57810190830284830290049160010191906064565b90939004925050503660b814609f57366102705734610270575f5260205ff35b8034106102705760383567ffffffffffffffff1680633b9aca001161027057633b9aca00029034031061027057600154600101600155600354806006026004015f358155600101602035815560010160403581556001016060358155600101608035815560010160a035905560b85f5f3760b85fa0600101600355005b60035460025480820380604011610131575060405b5f5b8181146101d7578281016006026004018160b8028154815260200181600101548152602001816002015480825260401c67ffffffffffffffff16816010018160381c81600701538160301c81600601538160281c81600501538160201c81600401538160181c81600301538160101c81600201538160081c816001015353602001816003015481526020018160040154815260200190600501549052600101610133565b91018092146101e957906002556101f4565b90505f6002555f6003555b36610242575f54600154817fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff1461023057600882820111610238575b50505f610264565b0160089003610264565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff5b5f555f60015560b8025ff35b5f5ffd";

/**
 * The single-node ethrex + Lighthouse devnet (after
 * forshtat/mempool-workshop-sidecar's test/e2e/kurtosis/eip8141-single-node.yaml):
 * Osaka at genesis, Amsterdam at epoch 1, Hegota (frames) at epoch 2.
 */
export function kurtosisConfig(funded: Address[]): object {
  return {
    participants: [
      {
        el_type: "ethrex",
        el_image: "ethrex:local",
        cl_type: "lighthouse",
        cl_image: "ethpandaops/lighthouse:focil",
        validator_count: 32,
        el_extra_params: [
          "--http.api=ethrex",
          "--http.api=debug",
          "--http.api=txpool",
        ],
        supernode: true,
      },
    ],
    network_params: {
      network_id: String(MINING_CHAIN.id),
      seconds_per_slot: 6,
      fulu_fork_epoch: 0,
      gloas_fork_epoch: 1,
      heze_fork_epoch: 2,
      prefunded_accounts: JSON.stringify(
        Object.fromEntries(funded.map((a) => [a, { balance: "1000000ETH" }])),
      ),
      additional_preloaded_contracts: {
        [EIP8282_DEPOSIT]: {
          balance: "0",
          nonce: "1",
          code: EIP8282_DEPOSIT_CODE,
          storage: {
            [`0x${"00".repeat(32)}`]: `0x${"ff".repeat(32)}`,
          },
        },
      },
    },
    ethereum_genesis_generator_params: {
      image: "ethpandaops/ethereum-genesis-generator:6.1.6",
    },
    port_publisher: { el: { enabled: true, public_port_start: 32000 } },
  };
}

/** Why a step failed: Bun's ShellError says only the exit code, so what the command printed is added. */
export function failureMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const stderr = (error as { stderr?: unknown }).stderr;
  const printed =
    stderr instanceof Uint8Array
      ? Buffer.from(stderr).toString("utf8").trim()
      : typeof stderr === "string"
        ? stderr.trim()
        : "";
  return printed ? `${error.message}: ${printed}` : error.message;
}
