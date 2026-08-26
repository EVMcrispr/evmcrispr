import { describe, expect, it } from "bun:test";
import { decodeAbiParameters, keccak256, toHex } from "viem";
import {
  encodeModuleData,
  Module,
  TriggerType,
} from "../../src/utils/moduleData";

const VAULT = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";

function decodeTrigger(arg: `0x${string}`) {
  const [type, inner] = decodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes" }],
    arg,
  );
  return { type, inner };
}

describe("gelato > encodeModuleData", () => {
  it("encodes a time trigger as TRIGGER/TIME(start, interval)", () => {
    const { modules, args } = encodeModuleData({
      trigger: { type: "time", start: 1000n, interval: 3600n },
    });
    expect(modules).toEqual([Module.TRIGGER]);
    const { type, inner } = decodeTrigger(args[0]);
    expect(type).toBe(TriggerType.TIME);
    expect(
      decodeAbiParameters([{ type: "uint128" }, { type: "uint128" }], inner),
    ).toEqual([1000n, 3600n]);
  });

  it("encodes a cron trigger", () => {
    const { args } = encodeModuleData({
      trigger: { type: "cron", expression: "0 0 * * *" },
    });
    const { type, inner } = decodeTrigger(args[0]);
    expect(type).toBe(TriggerType.CRON);
    expect(decodeAbiParameters([{ type: "string" }], inner)).toEqual([
      "0 0 * * *",
    ]);
  });

  it("encodes an event trigger with topic filters", () => {
    const topic = keccak256(toHex("Deposit(address,uint256)"));
    const { args } = encodeModuleData({
      trigger: {
        type: "event",
        address: VAULT,
        topics: [[topic]],
        confirmations: 0n,
      },
    });
    const { type, inner } = decodeTrigger(args[0]);
    expect(type).toBe(TriggerType.EVENT);
    const [address, topics, confirmations] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes32[][]" }, { type: "uint256" }],
      inner,
    );
    expect(address).toBe(VAULT);
    expect(topics).toEqual([[topic]]);
    expect(confirmations).toBe(0n);
  });

  it("orders modules by enum id whatever the input order", () => {
    const { modules, args } = encodeModuleData({
      trigger: { type: "block" },
      singleExec: true,
      proxy: true,
      resolver: { address: VAULT, data: "0x1234" },
    });
    expect(modules).toEqual([
      Module.RESOLVER,
      Module.PROXY,
      Module.SINGLE_EXEC,
      Module.TRIGGER,
    ]);
    expect(args[1]).toBe("0x");
    expect(args[2]).toBe("0x");
    expect(
      decodeAbiParameters([{ type: "address" }, { type: "bytes" }], args[0]),
    ).toEqual([VAULT, "0x1234"]);
    expect(decodeTrigger(args[3]).type).toBe(TriggerType.BLOCK);
  });

  it("encodes a web3 function as (cid, encoded user args)", () => {
    const { modules, args } = encodeModuleData({
      web3Function: { cid: "QmCid", args: "0x1234" },
      trigger: { type: "time", start: 0n, interval: 300n },
    });
    expect(modules).toEqual([Module.WEB3_FUNCTION, Module.TRIGGER]);
    const [cid, encoded] = decodeAbiParameters(
      [{ type: "string" }, { type: "bytes" }],
      args[0],
    );
    expect(cid).toBe("QmCid");
    expect(encoded).toBe("0x1234");
  });
});
