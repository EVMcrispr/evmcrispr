import { resolve } from "node:path";

export const CHAIN_ID = 100;
export const ANVIL_URL = "http://127.0.0.1:8545";

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
 *  every test process in a session picks the SAME block — foundry's disk
 *  RPC cache and DRPC's cache are both keyed by (chain, block). */
const BLOCK_BUCKET = 1000;

let forkBlock: Promise<number> | undefined;

/**
 * Recent gnosis fork block, resolved once per process: latest minus a
 * reorg margin, rounded down to a shared bucket. Never goes stale, stays
 * on state DRPC serves cheaply.
 */
export function getForkBlockNumber(): Promise<number> {
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

export function getEndpoint(): string | undefined {
  const apiKey = process.env.VITE_DRPC_API_KEY;
  return apiKey ? `https://lb.drpc.live/gnosis/${apiKey}` : undefined;
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
    const res = await fetch(ANVIL_URL, {
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
 * Reset a running anvil back to a pristine fork: discards every mutation
 * (mints, balances, sim:fork's reset-to-latest) so each caller starts
 * from identical state. Cheap because foundry's disk RPC cache is keyed
 * by (chain, block) and processes share the bucketed block. Returns false
 * when the node didn't answer (wedged or down).
 */
export async function resetAnvil(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(ANVIL_URL, {
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
 * FALLBACK_FORK_BLOCK note) leaving a process that holds :8545 but answers
 * nothing — every later test run then fails with a confusing startup
 * timeout. Returns true if a listener was killed.
 */
export function killStaleAnvil(): boolean {
  const port = new URL(ANVIL_URL).port || "8545";
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
 * Make sure a responsive anvil is serving ANVIL_URL: reuse a live one,
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
