import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const CHAIN_ID = 100;

/**
 * The anvil this process talks to.
 *
 * A port rather than a constant, because more than one test runner can be
 * working in the same checkout at once — a second runner sharing an anvil
 * resets the fork, mines and mutates state under the first, which surfaces as
 * failures that reproduce nowhere and look like flakiness in whatever suite
 * happened to be reading at the time.
 *
 * `run-integration-tests.ts` acquires a port and exports it, so its child test
 * processes inherit it. A bare `bun test` with nothing set falls back to the
 * default, which keeps the common single-runner case exactly as it was.
 *
 * Read through the functions, never cached at module load: the runner sets the
 * variable after this module is imported.
 */
export const DEFAULT_ANVIL_PORT = 8545;
export const ANVIL_PORT_ENV = "EVMCRISPR_ANVIL_PORT";

export function anvilPort(): number {
  const raw = process.env[ANVIL_PORT_ENV];
  const port = raw === undefined ? DEFAULT_ANVIL_PORT : Number(raw);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_ANVIL_PORT;
}

export function anvilUrl(): string {
  return `http://127.0.0.1:${anvilPort()}`;
}

/**
 * Fallback gnosis fork block for when the upstream RPC can't be asked for
 * a fresh one. Only used offline — a stale pin makes DRPC walk the
 * archive for every state read, which backs up anvil 1.5.x's upstream
 * request queue and deadlocks it, so the real block is resolved
 * dynamically by `getForkBlockNumber`.
 */
const FALLBACK_FORK_BLOCK = 47440000;

/** Stay clear of reorgs; gnosis finalizes well within this. */
const REORG_MARGIN_BLOCKS = 100;
/** Round the fork block down to this bucket (~85 min of gnosis blocks) so
 *  every test process in a session — and CI runs close in time — pick the
 *  SAME block: foundry's disk RPC cache and DRPC's cache are both keyed by
 *  (chain, block). Gnosis only: on mainnet the same bucket is ~3.3 h of
 *  blocks, which pushes DRPC onto its archive path for every state read
 *  (first reads went from ~1 s to >30 s in CI), so other chains fork at
 *  latest instead. */
const BLOCK_BUCKET = 1000;

/** DRPC network slugs for the chains the tests fork. */
const DRPC_NETWORKS: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  100: "gnosis",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
};

let forkBlock: Promise<number> | undefined;

/**
 * Fork block for a chain. Gnosis (the shared anvil's chain) resolves once
 * per process to latest minus a reorg margin, rounded down to the shared
 * bucket — never stale, on state DRPC serves cheaply — with a pinned
 * fallback offline. Every other chain resolves to undefined: fork at
 * latest (see BLOCK_BUCKET for why pinning them back is a net loss).
 */
export function getForkBlockNumber(): Promise<number>;
export function getForkBlockNumber(
  chainId: number,
): Promise<number | undefined>;
export function getForkBlockNumber(
  chainId: number = CHAIN_ID,
): Promise<number | undefined> {
  if (chainId !== CHAIN_ID) return Promise.resolve(undefined);
  forkBlock ??= (async () => {
    const endpoint = getEndpoint();
    if (!endpoint) return FALLBACK_FORK_BLOCK;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });
      const { result } = (await res.json()) as { result?: string };
      if (!result) return FALLBACK_FORK_BLOCK;
      const latest = Number(BigInt(result));
      return (
        Math.floor((latest - REORG_MARGIN_BLOCKS) / BLOCK_BUCKET) * BLOCK_BUCKET
      );
    } catch {
      return FALLBACK_FORK_BLOCK;
    }
  })();
  return forkBlock;
}

export function getEndpoint(chainId: number = CHAIN_ID): string | undefined {
  const apiKey = process.env.VITE_DRPC_API_KEY;
  const network = DRPC_NETWORKS[chainId];
  return apiKey && network
    ? `https://lb.drpc.live/${network}/${apiKey}`
    : undefined;
}

export async function loadEnv(): Promise<void> {
  const envFile = Bun.file(resolve(import.meta.dir, "../.env"));
  if (await envFile.exists()) {
    const text = await envFile.text();
    for (const line of text.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key && !key.startsWith("#")) {
        process.env[key.trim()] = rest.join("=").trim();
      }
    }
  }
}

export async function isAnvilRunning(): Promise<boolean> {
  try {
    const res = await fetch(anvilUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "net_version", id: 1 }),
      // A busy anvil that answers slowly is still running; a hung probe
      // must not stall the preload (or spawn a doomed second instance).
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Whether anvil serves fork state, not just RPC: a node mid-reset (or one
 * whose upstream stopped answering) reports a block number but returns
 * null for the block itself, which forks built on top of it then trip
 * over as "block not found on upstream".
 */
export async function isAnvilHealthy(): Promise<boolean> {
  try {
    const res = await fetch(anvilUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["latest", false],
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { result?: unknown };
    return body.result != null;
  } catch {
    return false;
  }
}

/**
 * Reset a running anvil back to a pristine fork: discards every mutation
 * (mints, balances, sim:fork's reset-to-latest) so each caller starts
 * from identical state. Cheap because foundry's disk RPC cache is keyed
 * by (chain, block) and processes share the bucketed block. Returns false
 * when the node didn't answer (wedged or down).
 */
export async function resetAnvil(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(anvilUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "anvil_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: endpoint,
              blockNumber: await getForkBlockNumber(),
            },
          },
        ],
        id: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { error?: unknown };
    return body.error === undefined;
  } catch {
    return false;
  }
}

/**
 * Kill a wedged anvil squatting on the port: anvil 1.5.x can deadlock (see
 * FALLBACK_FORK_BLOCK note) leaving a process that holds the port but answers
 * nothing — every later test run then fails with a confusing startup
 * timeout. Returns true if a listener was killed.
 */
export function killStaleAnvil(): boolean {
  const port = String(anvilPort());
  const lsof = Bun.spawnSync(["lsof", "-t", `-i:${port}`, "-sTCP:LISTEN"]);
  const pids = lsof.stdout.toString().trim().split("\n").filter(Boolean);
  let killed = false;
  for (const pid of pids) {
    const comm = Bun.spawnSync(["ps", "-o", "comm=", "-p", pid])
      .stdout.toString()
      .trim();
    if (comm === "anvil") {
      process.kill(Number(pid), "SIGKILL");
      killed = true;
    }
  }
  return killed;
}

export async function spawnAnvil(
  endpoint: string,
): Promise<ReturnType<typeof Bun.spawn>> {
  return Bun.spawn(
    [
      "anvil",
      "--fork-url",
      endpoint,
      "--fork-block-number",
      String(await getForkBlockNumber()),
      "--chain-id",
      String(CHAIN_ID),
      "--port",
      String(anvilPort()),
      "--silent",
    ],
    // Quiet the expected "Address already in use" of a lost startup race;
    // real failures surface through the readiness timeout.
    { stderr: "ignore" },
  );
}

export async function waitForAnvil(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAnvilRunning()) return true;
    await Bun.sleep(500);
  }
  return false;
}

/**
 * Make sure a responsive anvil is serving this process's anvil URL: reuse a live one,
 * replace a wedged one, or start a fresh one. Returns the spawned process
 * when this call started it (the caller owns shutdown), undefined when an
 * existing instance was reused or no endpoint is configured.
 */
export async function ensureAnvil(): Promise<
  ReturnType<typeof Bun.spawn> | undefined
> {
  if (await isAnvilRunning()) return undefined;

  const endpoint = getEndpoint();
  if (!endpoint) return undefined;

  if (killStaleAnvil()) {
    console.warn("anvil: killed a stale instance squatting on the port");
    await Bun.sleep(300);
  }

  // Parallel test processes race to start the shared anvil. A small jitter
  // plus a re-check lets most losers see the winner instead of colliding on
  // the port; a collision is still harmless (the loser exits silently and
  // the readiness wait below finds the winner).
  await Bun.sleep(Math.random() * 300);
  let anvil: ReturnType<typeof Bun.spawn> | undefined;
  if (!(await isAnvilRunning())) {
    anvil = await spawnAnvil(endpoint);
  }

  if (!(await waitForAnvil(30_000))) {
    throw new Error(
      "Anvil failed to start within 30s (check VITE_DRPC_API_KEY and whether the port is blocked)",
    );
  }

  // If we spawned a process that lost the port race, it has already
  // exited — nothing for the caller to kill later.
  if (anvil && anvil.exitCode !== null) return undefined;
  return anvil;
}

/**
 * Claim a port for this runner, so two runners in the same checkout never
 * share an anvil.
 *
 * Lowest free port wins, which means a single runner reuses the same one run
 * after run and keeps its anvil warm — the reason the fork block is bucketed
 * in the first place. A lock file holds the owning pid; a lock whose process
 * is gone is reclaimed, so a killed runner does not strand a port.
 *
 * Creation is exclusive (`wx`), so two runners racing for the same port cannot
 * both win it.
 */
const LOCK_DIR = resolve(import.meta.dir, "../node_modules/.cache/anvil-ports");
const PORT_RANGE = 16;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireAnvilPort(): { port: number; release: () => void } {
  mkdirSync(LOCK_DIR, { recursive: true });
  for (let i = 0; i < PORT_RANGE; i++) {
    const port = DEFAULT_ANVIL_PORT + i;
    const lock = join(LOCK_DIR, `${port}.lock`);
    try {
      writeFileSync(lock, String(process.pid), { flag: "wx" });
    } catch {
      // Taken, unless whoever took it is gone.
      let owner = 0;
      try {
        owner = Number(readFileSync(lock, "utf8"));
      } catch {
        continue;
      }
      if (owner !== process.pid && pidAlive(owner)) continue;
      writeFileSync(lock, String(process.pid));
    }
    return {
      port,
      release: () => {
        try {
          if (Number(readFileSync(lock, "utf8")) === process.pid) rmSync(lock);
        } catch {
          // Already gone; nothing to release.
        }
      },
    };
  }
  throw new Error(
    `no free anvil port in ${DEFAULT_ANVIL_PORT}..${DEFAULT_ANVIL_PORT + PORT_RANGE - 1}`,
  );
}
