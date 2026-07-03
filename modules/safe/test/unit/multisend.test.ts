import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  encodeMultiSendCall,
  packMultiSendTransactions,
} from "../../src/utils/multisend";

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;

describe("Safe > utils > multisend", () => {
  it("packs a single call with empty data", () => {
    const packed = packMultiSendTransactions([{ to: A }]);
    expect(packed).to.equal(
      `0x00${A.slice(2)}${"0".repeat(64)}${"0".repeat(64)}`,
    );
  });

  it("packs operation, value, and data without padding", () => {
    const packed = packMultiSendTransactions([
      { to: A, value: 2n, data: "0xdeadbeef", operation: 1 },
    ]);
    expect(packed).to.equal(
      `0x01${A.slice(2)}${"0".repeat(63)}2${"0".repeat(62)}04deadbeef`,
    );
  });

  it("concatenates multiple transactions in order", () => {
    const packed = packMultiSendTransactions([
      { to: A, data: "0xaa" },
      { to: B, data: "0xbb" },
    ]);
    expect(packed).to.equal(
      `0x00${A.slice(2)}${"0".repeat(64)}${"0".repeat(62)}01aa` +
        `00${B.slice(2)}${"0".repeat(64)}${"0".repeat(62)}01bb`,
    );
  });

  it("encodes a multiSend call with the right selector", () => {
    const data = encodeMultiSendCall([{ to: A }]);
    expect(data.slice(0, 10)).to.equal("0x8d80ff0a");
  });

  it("rejects actions without a target", () => {
    expect(() => packMultiSendTransactions([{ data: "0x" }])).to.throw(
      "not supported inside a Safe transaction",
    );
  });
});
