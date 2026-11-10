import { afterEach, expect, test } from "bun:test";
import { getTransports } from "../../packages/test-utils/src/client";
import { anvilUrl, getEndpoint } from "../anvil-config";

const keys = [
  "VITE_DRPC_API_KEY",
  "EVMCRISPR_RPC_URL_1",
  "EVMCRISPR_RPC_URL_100",
] as const;
const saved = keys.map((key) => process.env[key]);

afterEach(() => {
  keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key];
    else process.env[key] = saved[index];
  });
});

test("a chain's explicit endpoint takes precedence over DRPC", () => {
  process.env.VITE_DRPC_API_KEY = "test-key";
  process.env.EVMCRISPR_RPC_URL_100 = "https://gnosis.example";
  expect(getEndpoint()).toBe("https://gnosis.example");
  delete process.env.EVMCRISPR_RPC_URL_100;
  expect(getEndpoint()).toBe("https://lb.drpc.live/gnosis/test-key");
  delete process.env.VITE_DRPC_API_KEY;
  expect(getEndpoint()).toBeUndefined();
});

test("cross-chain reads honor overrides while Gnosis stays on the local fork", () => {
  process.env.EVMCRISPR_RPC_URL_1 = "https://ethereum.example";
  process.env.EVMCRISPR_RPC_URL_100 = "https://gnosis.example";
  const transports = getTransports();
  expect(transports[1]({}).value?.url).toBe("https://ethereum.example");
  expect(transports[100]({}).value?.url).toBe(anvilUrl());
});
