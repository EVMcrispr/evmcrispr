import { resolve } from "node:path";

export const FORK_BLOCK_NUMBER = 34630239;
export const CHAIN_ID = 100;
export const ANVIL_URL = "http://127.0.0.1:8545";

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
    });
    return res.ok;
  } catch {
    return false;
  }
}
