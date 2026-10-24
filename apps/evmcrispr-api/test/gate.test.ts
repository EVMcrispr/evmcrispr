import { describe, expect, it } from "bun:test";
import {
  clientAddress,
  DEFAULT_ORIGINS,
  originAllowed,
  readBody,
} from "../src/api/common.js";
import { ApiStore } from "../src/api/store.js";
import { reply, setup } from "./api-utils.js";

describe("in-memory cache and quotas", () => {
  it("keeps buckets independent, expires windows, and starts empty after restart", () => {
    const limits = { perAddress: 2, total: 3, window: 10 };
    const store = new ApiStore();
    try {
      store.set("key", { cached: true }, 1);
      expect(store.count("PIN", "a", limits, 10)).toBeUndefined();
      expect(store.get("key")?.value).toEqual({ cached: true });
      expect(store.count("PIN", "a", limits, 11)).toBeUndefined();
      expect(store.count("PIN", "a", limits, 12)).toBe(8);
      expect(store.count("PIN", "b", limits, 12)).toBeUndefined();
      expect(store.count("PIN", "c", limits, 13)).toBe(7);
      expect(store.count("ETHERSCAN", "a", limits, 13)).toBeUndefined();
      expect(store.count("PIN", "a", limits, 20)).toBeUndefined();
      expect(store.count("OFF", "a", { ...limits, perAddress: 0 }, 20)).toBe(
        10,
      );
      const restarted = new ApiStore();
      expect(restarted.get("key")).toBeUndefined();
      expect(restarted.count("PIN", "a", limits, 20)).toBeUndefined();
      restarted.close();
    } finally {
      store.close();
    }
  });

  it("bounds cache entries and groups excess addresses", () => {
    const store = new ApiStore(2, 100);
    try {
      for (let i = 0; i < 3; i++) store.set(String(i), i, i);
      expect(store.get("0")).toBeUndefined();
      store.set("huge", "x".repeat(101), 5);
      expect(store.get("huge")).toBeUndefined();
      const limits = { perAddress: 1, total: 2000, window: 10 };
      for (let i = 0; i <= 1024; i++)
        expect(store.count("PIN", String(i), limits, 1)).toBeUndefined();
      expect(store.count("PIN", "1025", limits, 1)).toBe(10);
    } finally {
      store.close();
    }
  });

  it("fails closed before spending a provider key when quota storage fails", async () => {
    let called = false;
    const api = setup(
      async () => {
        called = true;
        return reply({});
      },
      { PINATA_JWT: "private" },
    );
    api.context.store.close();
    const response = await api.request("/ipfs/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"pinataContent":{}}',
    });
    expect(response.status).toBe(503);
    expect(called).toBe(false);
  });
});

describe("caller identity and body limits", () => {
  it("limits browser origins to whole subdomains and ports", () => {
    for (const origin of [
      "https://evmcrispr.com",
      "https://next.evmcrispr.com",
      "http://localhost:3002",
    ])
      expect(originAllowed(origin, DEFAULT_ORIGINS)).toBe(true);
    for (const origin of [
      "https://evmcrispr.com.evil.test",
      "https://evil.test/.evmcrispr.com",
      "https://a.b.evmcrispr.com",
      "null",
    ])
      expect(originAllowed(origin, DEFAULT_ORIGINS)).toBe(false);
  });

  it("ignores spoofed forwarding headers unless explicitly trusted and groups IPv6 /64", () => {
    const api = setup(async () => reply({}));
    const req = new Request("https://api.evmcrispr.com/", {
      headers: { "x-forwarded-for": "1.2.3.4, 192.0.2.2:80" },
    });
    expect(clientAddress(api.context, req, "192.0.2.1")).toBe("192.0.2.1");
    api.context.env.CLIENT_ADDRESS_HEADER = "x-forwarded-for";
    expect(clientAddress(api.context, req, "192.0.2.1")).toBe("192.0.2.2");
    delete api.context.env.CLIENT_ADDRESS_HEADER;
    expect(clientAddress(api.context, req, "[2001:0db8:1:2::123]:90")).toBe(
      "2001:db8:1:2::/64",
    );
    expect(clientAddress(api.context, req, "::ffff:192.0.2.1")).toBe(
      "192.0.2.1",
    );
  });

  it("enforces both declared and chunked body sizes", async () => {
    const declared = await readBody(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-length": "99999999999999999999" },
        body: "x",
      }),
      4,
      "large",
    );
    expect(declared).toBeInstanceOf(Response);
    expect((declared as Response).status).toBe(413);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(3));
        controller.enqueue(new Uint8Array(3));
        controller.close();
      },
    });
    const actual = await readBody(
      new Request("http://localhost", { method: "POST", body: stream }),
      4,
      "large",
    );
    expect((actual as Response).status).toBe(413);
    expect(
      await readBody(
        new Request("http://localhost", { method: "POST", body: "1234" }),
        4,
        "large",
      ),
    ).toEqual(new TextEncoder().encode("1234"));
  });
});
