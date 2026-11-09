#!/usr/bin/env bun
// Local EIP-8141 frame devnets, with anvil's ten accounts funded.
//
//   bun scripts/frame-devnet.ts up quick    one ethrex container, chain 81411, never mines
//   bun scripts/frame-devnet.ts up mining   ethrex + Lighthouse in Kurtosis, chain 81412
//   bun scripts/frame-devnet.ts up altmempool
//       the same on chain 81413, with the ERC-8421 sidecar (the alt mempool)
//       in front, as on the public alt-mempool devnet
//   bun scripts/frame-devnet.ts down | status
//
// Their chain ids and RPCs are the frames module's chains
// (modules/frames/src/chains.ts: framesQuick, framesMining,
// framesAltMempool), so a script can `switch` to them. Nothing third-party
// is vendored: the quick devnet's genesis is read out of the pinned image
// and extended, the Kurtosis config is written from
// scripts/frame-devnet-config.ts, and the sidecar is built from a pinned
// commit of its repository.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ChainDef } from "@evmcrispr/sdk";
import { $ } from "bun";
import {
  ALT_MEMPOOL_CHAIN,
  devAccounts,
  ETHEREUM_PACKAGE,
  extendGenesis,
  FUNDED_BALANCE,
  failureMessage,
  type GenesisJson,
  kurtosisConfig,
  MINING_CHAIN,
  QUICK_CHAIN,
  rpcPort,
  SIDECAR_COMMIT,
  SIDECAR_IMAGE,
  SIDECAR_REPO,
  sidecarArgs,
  sidecarConfig,
} from "./frame-devnet-config";

const ROOT = resolve(import.meta.dir, "..");
const CACHE = resolve(ROOT, "node_modules/.cache/frame-devnet");

const QUICK_IMAGE =
  "ghcr.io/forshtat/eip8141-devnet@sha256:c9a7770f892e02255999e1c0ffd596ecee704d9175c2480811ccdcfa1c2224c6";
const QUICK_CONTAINER = "evmcrispr-frame-devnet";
const MINING_EL_IMAGE = "ghcr.io/forshtat/ethrex:eip8141-tracer-latest";
const ENCLAVE = "evmcrispr-frames";
const ALT_ENCLAVE = "evmcrispr-frames-altmempool";
const SIDECAR_CONTAINER = "evmcrispr-frames-sidecar";
const EL_SERVICE = "el-1-ethrex-lighthouse";
/** Hegota (frames) is active from epoch 2: 2 × 32 slots × 6 s after genesis. */
const HEGOTA_AFTER_S = 2 * 32 * 6;

async function rpc<T>(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  });
  const json = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

/** Waits for the chain's RPC (`url`, its declared one by default), and
 *  checks it is that chain. */
async function waitForChain(
  chain: ChainDef,
  seconds: number,
  url = chain.rpcUrl,
): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    let id: number | undefined;
    try {
      id = Number(await rpc<string>(url, "eth_chainId"));
    } catch {
      await Bun.sleep(1_000);
      continue;
    }
    if (id !== chain.id)
      throw new Error(`${url} is chain ${id}, not ${chain.name} (${chain.id})`);
    return;
  }
  throw new Error(`${url} did not answer eth_chainId within ${seconds} s`);
}

function requireAmd64() {
  if (process.arch !== "x64")
    throw new Error(
      `the frame devnet images (${QUICK_IMAGE}, ${MINING_EL_IMAGE}) are published for linux/amd64 only; this host is ${process.arch}`,
    );
}

async function upQuick() {
  requireAmd64();
  const port = rpcPort(QUICK_CHAIN);
  mkdirSync(CACHE, { recursive: true });
  const original = JSON.parse(
    await $`docker run --rm --entrypoint cat ${QUICK_IMAGE} /fixtures/genesis/l1-hegota.json`.text(),
  ) as GenesisJson;
  const genesis = extendGenesis(
    original,
    devAccounts().map((a) => a.address),
    FUNDED_BALANCE,
    QUICK_CHAIN.id,
  );
  const file = resolve(CACHE, "l1-hegota.json");
  writeFileSync(file, JSON.stringify(genesis));
  await $`docker rm -f ${QUICK_CONTAINER}`.quiet().nothrow();
  await $`docker run -d --name ${QUICK_CONTAINER} -p 127.0.0.1:${port}:8545 -v ${file}:/genesis.json:ro ${QUICK_IMAGE} --network /genesis.json --http.addr 0.0.0.0 --http.port 8545 --http.api eth,net,web3,ethrex,debug,txpool`.quiet();
  await waitForChain(QUICK_CHAIN, 60);
  console.log(
    `${QUICK_CHAIN.name} up: ${QUICK_CHAIN.rpcUrl} (chain ${QUICK_CHAIN.id}, "switch ${QUICK_CHAIN.key}"; never mines)`,
  );
}

/**
 * Starts `chain` as ethrex + Lighthouse in the Kurtosis enclave `enclave`
 * and waits until frame transactions are valid on it. Returns ethrex's RPC.
 */
async function kurtosisChain(
  chain: ChainDef,
  enclave: string,
  portStart: number,
): Promise<string> {
  requireAmd64();
  const running = await $`kurtosis enclave inspect ${enclave}`
    .quiet()
    .nothrow();
  if (running.exitCode === 0)
    throw new Error(`enclave ${enclave} already exists: run "down" first`);
  await $`docker pull ${MINING_EL_IMAGE}`.quiet();
  await $`docker tag ${MINING_EL_IMAGE} ethrex:local`.quiet();
  await $`kurtosis engine start`.quiet().nothrow();
  mkdirSync(CACHE, { recursive: true });
  const config = resolve(CACHE, `${enclave}.json`);
  writeFileSync(
    config,
    JSON.stringify(
      kurtosisConfig(
        devAccounts().map((a) => a.address),
        chain,
        portStart,
      ),
      null,
      2,
    ),
  );
  console.log(
    `starting enclave ${enclave} (frames from about 7 minutes after genesis)…`,
  );
  await $`kurtosis run --enclave ${enclave} ${ETHEREUM_PACKAGE} --args-file ${config}`.quiet();
  const port = (
    await $`kurtosis port print ${enclave} ${EL_SERVICE} rpc --format number`.text()
  ).trim();
  const url = `http://127.0.0.1:${port}`;
  await waitForChain(chain, 120, url);

  const block = (tag: string) =>
    rpc<{ number: string; timestamp: string }>(url, "eth_getBlockByNumber", [
      tag,
      false,
    ]);
  const genesisTime = Number((await block("0x0")).timestamp);
  const ready = genesisTime + HEGOTA_AFTER_S + 12;
  const started = Date.now();
  let last = -1;
  let lastChange = Date.now();
  let lastPrint = 0;
  for (;;) {
    const latest = await block("latest");
    const number = Number(latest.number);
    if (Number(latest.timestamp) >= ready) {
      console.log(`  frames active from block ${number}`);
      return url;
    }
    if (number !== last) {
      last = number;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange > 90_000)
      throw new Error(`the devnet stopped producing blocks at block ${number}`);
    if (Date.now() - started > 15 * 60_000)
      throw new Error(
        `frames were not active after 15 minutes (block ${number})`,
      );
    if (Date.now() - lastPrint > 60_000) {
      lastPrint = Date.now();
      console.log(
        `  block ${number}, frames in about ${Math.max(0, ready - Math.floor(Date.now() / 1000))} s`,
      );
    }
    await Bun.sleep(5_000);
  }
}

async function upMining() {
  const url = await kurtosisChain(MINING_CHAIN, ENCLAVE, 32_000);
  if (url !== MINING_CHAIN.rpcUrl)
    throw new Error(
      `Kurtosis published the RPC at ${url}, but ${MINING_CHAIN.name} is declared at ${MINING_CHAIN.rpcUrl} (modules/frames/src/chains.ts): update the declaration or the config's port_publisher`,
    );
  console.log(
    `${MINING_CHAIN.name} up: ${url} (chain ${MINING_CHAIN.id}, "switch ${MINING_CHAIN.key}")`,
  );
}

/** The sidecar image, built once from the pinned commit. */
async function sidecarImage(): Promise<void> {
  const present = await $`docker image inspect ${SIDECAR_IMAGE}`
    .quiet()
    .nothrow();
  if (present.exitCode === 0) return;
  console.log(
    `building the sidecar at ${SIDECAR_COMMIT.slice(0, 7)} (once; several minutes)…`,
  );
  await $`docker build -t ${SIDECAR_IMAGE} ${`${SIDECAR_REPO}#${SIDECAR_COMMIT}`}`.quiet();
}

async function upAltMempool() {
  // The image first (it fails fast), then the chain (its own enclave and
  // port range, so it runs next to the mining devnet), then the sidecar in
  // front of it.
  await sidecarImage();
  const ethrex = await kurtosisChain(ALT_MEMPOOL_CHAIN, ALT_ENCLAVE, 33_000);
  const dir = resolve(CACHE, "sidecar");
  mkdirSync(resolve(dir, "data"), { recursive: true });
  // Anvil's #9 relays: funded in the genesis like the others.
  writeFileSync(
    resolve(dir, "config.json"),
    JSON.stringify(
      sidecarConfig(ethrex, devAccounts()[9]!.privateKey),
      null,
      2,
    ),
  );
  await $`docker rm -f ${SIDECAR_CONTAINER}`.quiet().nothrow();
  // The host's network: the sidecar reaches ethrex at its published port.
  await $`docker run -d --name ${SIDECAR_CONTAINER} --network host -v ${dir}:/sidecar ${SIDECAR_IMAGE} ${sidecarArgs(rpcPort(ALT_MEMPOOL_CHAIN), "/sidecar")}`.quiet();
  await waitForChain(ALT_MEMPOOL_CHAIN, 120);
  console.log(
    `${ALT_MEMPOOL_CHAIN.name} up: ${ALT_MEMPOOL_CHAIN.rpcUrl} (the sidecar; ethrex at ${ethrex}; chain ${ALT_MEMPOOL_CHAIN.id}, "switch ${ALT_MEMPOOL_CHAIN.key}")`,
  );
}

async function down() {
  await $`docker rm -f ${QUICK_CONTAINER} ${SIDECAR_CONTAINER}`
    .quiet()
    .nothrow();
  await $`kurtosis enclave rm ${ENCLAVE} --force`.quiet().nothrow();
  await $`kurtosis enclave rm ${ALT_ENCLAVE} --force`.quiet().nothrow();
  console.log("frame devnets stopped");
}

async function status() {
  for (const chain of [QUICK_CHAIN, MINING_CHAIN, ALT_MEMPOOL_CHAIN]) {
    let id: number;
    try {
      id = Number(await rpc<string>(chain.rpcUrl, "eth_chainId"));
    } catch {
      console.log(`${chain.name} (${chain.key}): not running`);
      continue;
    }
    if (id !== chain.id) {
      console.log(
        `${chain.name} (${chain.key}): ${chain.rpcUrl} answers as chain ${id}, not ${chain.id}: run "down", then "up" again`,
      );
      continue;
    }
    const [block, balance] = await Promise.all([
      rpc<string>(chain.rpcUrl, "eth_blockNumber"),
      rpc<string>(chain.rpcUrl, "eth_getBalance", [
        devAccounts()[0]!.address,
        "latest",
      ]),
    ]);
    console.log(
      `${chain.name} (${chain.key}, chain ${chain.id}) at ${chain.rpcUrl}: block ${Number(block)}, anvil #0 holds ${BigInt(balance) / 10n ** 18n} ETH`,
    );
  }
}

const [command, mode] = process.argv.slice(2);
try {
  if (command === "up" && mode === "quick") await upQuick();
  else if (command === "up" && mode === "mining") await upMining();
  else if (command === "up" && mode === "altmempool") await upAltMempool();
  else if (command === "down") await down();
  else if (command === "status") await status();
  else {
    console.error(
      "usage: frame-devnet.ts up quick|mining|altmempool | down | status",
    );
    process.exit(2);
  }
} catch (error) {
  console.error(failureMessage(error));
  process.exit(1);
}
