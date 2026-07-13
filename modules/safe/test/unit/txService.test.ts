import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import type { ServiceTransaction } from "../../src/utils/txService";
import { serviceTxToSafeTx } from "../../src/utils/txService";

const A = "0x1111111111111111111111111111111111111111" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

describe("Safe > utils > serviceTxToSafeTx", () => {
  it("coerces service fields into a SafeTx", () => {
    const serviceTx: ServiceTransaction = {
      safe: A,
      to: A,
      value: "1000",
      data: null,
      operation: 0,
      safeTxGas: "0",
      baseGas: "21000",
      gasPrice: "2",
      gasToken: ZERO,
      refundReceiver: ZERO,
      nonce: "42",
      safeTxHash: `0x${"0".repeat(64)}`,
      confirmationsRequired: 1,
      isExecuted: false,
      confirmations: [],
    };
    expect(serviceTxToSafeTx(serviceTx)).to.eql({
      to: A,
      value: 1000n,
      data: "0x",
      operation: 0,
      safeTxGas: 0n,
      baseGas: 21000n,
      gasPrice: 2n,
      gasToken: ZERO,
      refundReceiver: ZERO,
      nonce: 42n,
    });
  });
});
