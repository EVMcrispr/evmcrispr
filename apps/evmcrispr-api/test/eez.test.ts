import { describe, expect, it } from "bun:test";
import { encodeAbiParameters, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { safeInnerCalls, unwrapCall } from "../src/api/eez.js";
import { ADDRESS, reply, setup } from "./api-utils.js";

const env = {
  EEZ_CHAINS: "test=7331,https://execution.test/rpc,https://front.test/rpc",
};
const request = (method: string, params: unknown[] = [], id: unknown = 7) => ({
  method: "POST",
  body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
});
const revert = (data: string) => ({
  jsonrpc: "2.0",
  id: 1,
  error: { code: 3, data },
});
const word = (n: bigint) => n.toString(16).padStart(64, "0");
function safeCall(data: Hex, operation = 0): Hex {
  return `0x6a761202${encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes" }, { type: "uint8" }], [ADDRESS, 5n, data, operation]).slice(2)}`;
}

describe("EEZ routing compatibility", () => {
  it("forwards normal JSON-RPC batches byte for byte and rejects fillTransaction", async () => {
    const bodies: string[] = [];
    const api = setup(async (url, init) => {
      expect(String(url)).toBe("https://execution.test/rpc");
      bodies.push(await new Response(init?.body).text());
      return reply([{ jsonrpc: "2.0", id: "a", result: "0x1" }]);
    }, env);
    const body = ' [ {"jsonrpc":"2.0", "method":"eth_chainId", "id":"a"} ] ';
    expect(
      (
        await api.request("/experimental-eez-rpc/test", {
          method: "POST",
          body,
        })
      ).status,
    ).toBe(200);
    expect(bodies).toEqual([body]);
    expect(
      (
        await (
          await api.request(
            "/experimental-eez-rpc/test",
            request("eth_fillTransaction", [], "id"),
          )
        ).json()
      ).error.code,
    ).toBe(-32601);
    expect(
      (
        await api.request(
          "/experimental-eez-rpc/unknown",
          request("eth_chainId"),
        )
      ).status,
    ).toBe(404);
    expect((await api.request("/experimental-eez-rpc/test")).status).toBe(405);
  });

  it("recognizes all three registry reverts and preserves unrelated estimation errors", async () => {
    const api = setup(async () => reply({}), env);
    for (const selector of ["0xed6bc750", "0x9a499f3b", "0xf9d330ad"]) {
      api.context.fetch = async () => reply(revert(selector));
      expect(
        await (
          await api.request(
            "/experimental-eez-rpc/test",
            request("eth_estimateGas", [{ to: ADDRESS }], "gas"),
          )
        ).json(),
      ).toEqual({ jsonrpc: "2.0", id: "gas", result: "0xaae60" });
    }
    const failed = revert("0xdeadbeef");
    api.context.fetch = async () => reply(failed);
    expect(
      await (
        await api.request(
          "/experimental-eez-rpc/test",
          request("eth_estimateGas", [{ to: ADDRESS }]),
        )
      ).json(),
    ).toEqual(failed);
  });

  it("unwraps the three known call wrappers with strict offset bounds", () => {
    for (const [selector, types, values] of [
      [
        "0x6c544f33",
        [{ type: "address" }, { type: "bytes" }],
        [ADDRESS, "0x1234"],
      ],
      [
        "0xf8ec3958",
        [{ type: "address" }, { type: "bytes" }],
        [ADDRESS, "0x1234"],
      ],
      [
        "0x56573122",
        [{ type: "uint256" }, { type: "address" }, { type: "bytes" }],
        [0n, ADDRESS, "0x1234"],
      ],
    ] as const) {
      const data = `${selector}${encodeAbiParameters(types, values).slice(2)}`;
      expect(unwrapCall(data)).toEqual({ to: ADDRESS, data: "0x1234" });
    }
    expect(
      unwrapCall(`0x6c544f33${word(1n)}${"f".repeat(64)}`),
    ).toBeUndefined();
  });

  it("replays Safe CALLs and MultiSend CALL entries from the Safe address", async () => {
    const safe = "0x0000000000000000000000000000000000000010";
    const call = { to: safe, from: ADDRESS, data: safeCall("0x1234") };
    expect(safeInnerCalls(call)).toEqual([
      { from: safe, to: ADDRESS, value: "0x5", data: "0x1234" },
    ]);
    const packed =
      `0x00${ADDRESS.slice(2)}${word(1n)}${word(2n)}abcd01${ADDRESS.slice(2)}${word(0n)}${word(0n)}` as Hex;
    const multi =
      `0x8d80ff0a${encodeAbiParameters([{ type: "bytes" }], [packed]).slice(2)}` as Hex;
    expect(safeInnerCalls({ to: safe, data: safeCall(multi, 1) })).toEqual([
      { from: safe, to: ADDRESS, value: "0x1", data: "0xabcd" },
    ]);
    const seen: Record<string, unknown>[] = [];
    const api = setup(async (_url, init) => {
      const rpc = JSON.parse(await new Response(init?.body).text());
      seen.push(rpc);
      return reply(
        revert(rpc.method === "eth_call" ? "0xed6bc750" : "0xdeadbeef"),
      );
    }, env);
    expect(
      (
        await (
          await api.request(
            "/experimental-eez-rpc/test",
            request("eth_estimateGas", [call]),
          )
        ).json()
      ).result,
    ).toBe("0xaae60");
    expect((seen[1].params as unknown[])[0]).toEqual({
      from: safe,
      to: ADDRESS,
      value: "0x5",
      data: "0x1234",
    });
  });

  it("routes signed legacy, 2930, 1559, 4844, and 7702 transactions after simulation and front sync", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const transactions = [
      { type: "legacy", gasPrice: 1n },
      { type: "eip2930", gasPrice: 1n, accessList: [] },
      { type: "eip1559", maxFeePerGas: 2n, maxPriorityFeePerGas: 1n },
      {
        type: "eip4844",
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
        maxFeePerBlobGas: 1n,
        blobVersionedHashes: [`0x01${"11".repeat(31)}` as Hex],
      },
      {
        type: "eip7702",
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
        authorizationList: [],
      },
    ] as const;
    for (const transaction of transactions) {
      const raw = await account.signTransaction({
        ...transaction,
        chainId: 7331,
        nonce: 1,
        gas: 21000n,
        to: ADDRESS,
        value: 5n,
        data: "0x1234",
      });
      const seen: {
        url: string;
        value: Record<string, unknown>;
        body: string;
      }[] = [];
      let fronts = 0;
      const api = setup(async (url, init) => {
        const body = await new Response(init?.body).text();
        const value = JSON.parse(body);
        seen.push({ url: String(url), value, body });
        if (value.method === "eth_call") {
          expect(value.params[0]).toEqual({
            from: account.address,
            to: ADDRESS,
            data: "0x1234",
            value: "0x5",
          });
          return reply(revert("0xed6bc750"));
        }
        if (value.method === "eth_blockNumber")
          return reply({
            result:
              String(url).includes("front") && fronts++ === 0 ? "0x9" : "0xa",
          });
        return reply({ jsonrpc: "2.0", id: "signed", result: "0xtxhash" });
      }, env);
      const init = request("eth_sendRawTransaction", [raw], "signed");
      expect(
        (await (await api.request("/experimental-eez-rpc/test", init)).json())
          .result,
      ).toBe("0xtxhash");
      expect(seen.at(-1)?.url).toBe("https://front.test/rpc");
      expect(seen.at(-1)?.body).toBe(init.body);
      expect(seen.map((r) => r.value.method)).toEqual([
        "eth_call",
        "eth_blockNumber",
        "eth_blockNumber",
        "eth_blockNumber",
        "eth_sendRawTransaction",
      ]);
    }
  });

  it("keeps non-cross-chain signed transactions on execution and refuses an unsynced front", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const raw = await account.signTransaction({
      type: "eip1559",
      chainId: 7331,
      nonce: 1,
      gas: 21000n,
      to: ADDRESS,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    });
    let sent = 0;
    const api = setup(async (url, init) => {
      const rpc = JSON.parse(await new Response(init?.body).text());
      expect(String(url)).toContain("execution");
      if (rpc.method === "eth_sendRawTransaction") sent++;
      return reply({ result: "0x1" });
    }, env);
    await api.request(
      "/experimental-eez-rpc/test",
      request("eth_sendRawTransaction", [raw]),
    );
    expect(sent).toBe(1);
    api.context.fetch = async (url, init) => {
      const rpc = JSON.parse(await new Response(init?.body).text());
      if (rpc.method === "eth_call") return reply(revert("0xed6bc750"));
      if (rpc.method === "eth_sendRawTransaction") sent++;
      return reply({ result: String(url).includes("front") ? "0x1" : "0x2" });
    };
    const result = await (
      await api.request(
        "/experimental-eez-rpc/test",
        request("eth_sendRawTransaction", [raw], "unchanged"),
      )
    ).json();
    expect(result.id).toBe("unchanged");
    expect(result.error.code).toBe(-32603);
    expect(result.error.message).toContain("front not in sync");
    expect(sent).toBe(1);
  });
});
