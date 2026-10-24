import { afterEach } from "bun:test";
import type { ApiContext, Fetcher } from "../src/api/common.js";
import { createApi } from "../src/api/index.js";
import { ApiStore } from "../src/api/store.js";

const stores: ApiStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

export const ADDRESS = "0x00000000000000000000000000000000000000ab";
export const reply = (value: unknown, status = 200) =>
  Response.json(value, { status });
export function setup(fetch: Fetcher, env: ApiContext["env"] = {}) {
  const store = new ApiStore();
  stores.push(store);
  let now = 1_000_000;
  const api = createApi({
    store,
    fetch,
    env,
    now: () => now,
    sleep: async () => {},
  });
  return {
    ...api,
    advance: (ms: number) => {
      now += ms;
    },
    request: (path: string, init?: RequestInit, peer = "192.0.2.1") =>
      api.fetch(new Request(`https://api.evmcrispr.com${path}`, init), peer),
  };
}
