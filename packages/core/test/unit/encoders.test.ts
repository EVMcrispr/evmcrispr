import { describe, it } from "bun:test";
import { encodeAction } from "@evmcrispr/sdk";
import { expect } from "chai";
import { decodeFunctionData, parseAbi } from "viem";

const TARGET = "0x1234567890abcdef1234567890abcdef12345678";

describe("SDK > utils > encodeAction", () => {
  it("should encode a simple transfer(address,uint256) call", () => {
    const action = encodeAction(TARGET, "transfer(address,uint256)", [
      "0x0000000000000000000000000000000000000001",
      100n,
    ]);
    expect(action.to).to.equal(TARGET);
    expect(action.data).to.be.a("string");
    expect(action.data.startsWith("0x")).to.be.true;
  });

  it("should include value and from when provided", () => {
    const from = "0x0000000000000000000000000000000000000002";
    const action = encodeAction(
      TARGET,
      "transfer(address,uint256)",
      ["0x0000000000000000000000000000000000000001", 100n],
      { value: 1000n, from },
    );
    expect(action.value).to.equal(1000n);
    expect(action.from).to.equal(from);
  });

  it("should encode with the full 'function' prefix syntax", () => {
    const action = encodeAction(
      TARGET,
      "function approve(address spender, uint256 amount)",
      ["0x0000000000000000000000000000000000000001", 50n],
    );
    expect(action.data).to.be.a("string");
  });

  it("should encode using an ABI object", () => {
    const abi = parseAbi([
      "function transferFrom(address from, address to, uint256 amount)",
    ]);
    const action = encodeAction(
      TARGET,
      "transferFrom",
      [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        200n,
      ],
      { abi },
    );
    const decoded = decodeFunctionData({ abi, data: action.data });
    expect(decoded.functionName).to.equal("transferFrom");
  });

  it("should throw for an invalid signature", () => {
    expect(() => encodeAction(TARGET, "not-a-valid-signature", [])).to.throw(
      /Wrong signature format/,
    );
  });

  it("should throw for wrong parameter types", () => {
    expect(() =>
      encodeAction(TARGET, "transfer(address,uint256)", [
        "not-an-address",
        100n,
      ]),
    ).to.throw(/error when encoding/);
  });

  it("should handle bytes parameters by hex-encoding strings", () => {
    const action = encodeAction(TARGET, "store(bytes32)", [
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    ]);
    expect(action.data).to.be.a("string");
  });
});
