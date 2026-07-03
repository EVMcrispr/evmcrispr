import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { MULTISEND, MULTISEND_CALL_ONLY } from "../../src/addresses";
import {
  buildSafeTxContent,
  preValidatedSignature,
} from "../../src/utils/safeTx";

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;

describe("Safe > utils > safeTx", () => {
  it("passes a single action through untouched", () => {
    const content = buildSafeTxContent([
      { to: A, value: 5n, data: "0xdeadbeef" },
    ]);
    expect(content).to.eql({
      to: A,
      value: 5n,
      data: "0xdeadbeef",
      operation: 0,
    });
  });

  it("keeps a single delegatecall action's operation", () => {
    const content = buildSafeTxContent([{ to: A, operation: 1 }]);
    expect(content.operation).to.equal(1);
  });

  it("batches multiple calls through MultiSendCallOnly", () => {
    const content = buildSafeTxContent([{ to: A }, { to: B }]);
    expect(content.to).to.equal(MULTISEND_CALL_ONLY);
    expect(content.operation).to.equal(1);
    expect(content.value).to.equal(0n);
  });

  it("uses the full MultiSend when an inner action is a delegatecall", () => {
    const content = buildSafeTxContent([{ to: A }, { to: B, operation: 1 }]);
    expect(content.to).to.equal(MULTISEND);
  });

  it("rejects contract deployments", () => {
    expect(() => buildSafeTxContent([{ data: "0x" }])).to.throw(
      "not supported inside a Safe transaction",
    );
  });

  it("builds a pre-validated signature for an owner", () => {
    const signature = preValidatedSignature(A);
    expect(signature).to.equal(
      `0x000000000000000000000000${A.slice(2)}${"0".repeat(64)}01`,
    );
    // 65 bytes: r (32) ++ s (32) ++ v (1)
    expect(signature.length).to.equal(2 + 65 * 2);
  });
});
