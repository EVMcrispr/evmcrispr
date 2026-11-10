import { describe, expect, test } from "bun:test";
import { EVMCRISPR_API_BASE } from "../../src/config/api";
import { browserSafeUrl } from "../../src/config/browserSafeUrl";

describe("browserSafeUrl", () => {
  test("leaves loopback RPCs alone: they are the user's own machine", () => {
    for (const url of [
      "http://127.0.0.1:8570",
      "http://localhost:8545",
      "http://[::1]:8545/rpc",
    ])
      expect(browserSafeUrl(url)).toBe(url);
  });

  test("routes other plain-http URLs through the CORS proxy", () => {
    expect(browserSafeUrl("http://devnet.example.com:8545")).toBe(
      `${EVMCRISPR_API_BASE}/cors-proxy/http://devnet.example.com:8545`,
    );
  });

  test("uses https URLs as declared", () => {
    expect(browserSafeUrl("https://rpc.example.com")).toBe(
      "https://rpc.example.com",
    );
  });
});
