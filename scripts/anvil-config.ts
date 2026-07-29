import { resolve } from "node:path";

/**
 * Pinned gnosis fork block. Bump occasionally to keep DRPC's cache hot —
 * very old blocks force every state read to walk the archive, which
 * backs up anvil 1.5.x's upstream request queue and deadlocks it.
 */
export const FORK_BLOCK_NUMBER = 47440000;
export const CHAIN_ID = 100;
export const ANVIL_URL = "http://127.0.0.1:8545";

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
 * Reset a running anvil back to the pristine pinned fork: discards every
 * mutation (mints, balances, sim:fork's reset-to-latest) so each caller
 * starts from identical state. Cheap because foundry's disk RPC cache is
 * keyed by (chain, block) and the block is pinned. Returns false when the
 * node didn't answer (wedged or down).
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
              blockNumber: FORK_BLOCK_NUMBER,
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
 * FORK_BLOCK_NUMBER note) leaving a process that holds :8545 but answers
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

export function spawnAnvil(endpoint: string): ReturnType<typeof Bun.spawn> {
  return Bun.spawn(
    [
      "anvil",
      "--fork-url",
      endpoint,
      "--fork-block-number",
      String(FORK_BLOCK_NUMBER),
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
    anvil = spawnAnvil(endpoint);
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
