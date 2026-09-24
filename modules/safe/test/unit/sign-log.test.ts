import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { zeroAddress } from "viem";
import type Safe from "../../src";
import { enforceFindings, type SafeFinding } from "../../src/utils/assess";
import { logSafeSignable } from "../../src/utils/sign";
import { transactionSignable } from "../../src/utils/signables";

const SAFE = "0x1111111111111111111111111111111111111111";

describe("Safe transaction output", () => {
  it("logs nothing for a transaction: its status box shows it", () => {
    const lines: string[] = [];
    logSafeSignable(
      { context: { log: (m: string) => lines.push(m) } } as unknown as Safe,
      transactionSignable(100, SAFE, {
        to: SAFE,
        value: 0n,
        data: "0x",
        operation: 0,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: zeroAddress,
        refundReceiver: zeroAddress,
        nonce: 0n,
      }),
    );
    expect(lines).to.deep.equal([]);
  });

  it("reports a blocking finding only as the refusal error", () => {
    const findings: SafeFinding[] = [
      {
        check: "unverified-call",
        severity: "notice",
        path: "calls[0]",
        message: "call to an unverified contract",
      },
      {
        check: "delegatecall",
        severity: "block",
        path: "calls[1]",
        message: "delegatecall to an unknown contract",
      },
    ];
    expect(() => enforceFindings(findings, {}, "safe:propose")).to.throw(
      "safe:propose refused:\n- calls[1]: delegatecall to an unknown contract",
    );
  });
});
