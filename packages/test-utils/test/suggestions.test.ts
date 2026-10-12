import { describe, expect, it } from "bun:test";
import type { Suggestion } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { wellFormed } from "../src/suggestions";

const WHO = getAddress("0x00000000000000000000000000000000000e0ec0");
const TOKEN = getAddress("0x00000000000000000000000000000000000700e1");
const withLine = (line: string): Suggestion => ({
  line,
  vars: [
    ...(line.includes("$token") ? [{ name: "token", value: TOKEN }] : []),
    { name: "executor", value: WHO },
  ],
  sentence: [{ type: "text", text: "x" }],
  description: "x",
  kind: "amount",
  module: "t",
  event: "e",
  emitter: WHO,
});

describe("wellFormed", () => {
  it("accepts the chain's own currency by its symbol, in a balance and in an amount", () => {
    wellFormed(
      withLine("assert @balance!(XDAI $executor) >= @token:amount(XDAI 1.5)"),
    );
    wellFormed(
      withLine(
        "assert @balance!($token $executor) >= @token:amount($token 1.5)",
      ),
    );
    wellFormed(withLine("assert @balance!(ETH $executor) >= 5"), "ETH");
  });

  it("accepts a comment that says the unit of a variable of the line, or of the chain's currency, and no other", () => {
    wellFormed(
      withLine(
        "assert @balance!($token $executor) >= 5  # base units of $token",
      ),
    );
    wellFormed(
      withLine("assert @balance!(XDAI $executor) >= 5  # base units of XDAI"),
    );
    wellFormed(
      withLine(
        "assert $token::!{f(address,uint256)(uint256) $executor 5} >= 6  # base units of $token and XDAI",
      ),
    );
    for (const line of [
      "assert @balance!($token $executor) >= 5 # anything else",
      "assert @balance!($token $executor) >= 5  # base units of USDC",
      "assert @balance!($token $executor) >= 5  # base units of $token # more",
      "assert @balance!($token $executor) >= 5  # base units of ",
    ]) {
      expect(() => wellFormed(withLine(line)), line).toThrow("a comment");
    }
  });

  it("rejects any other bare word where a token goes", () => {
    for (const line of [
      "assert @balance!(USDC $executor) >= 5",
      "assert @balance!($token $executor) >= @token:amount(USDC 1.5)",
      "assert @balance!(XDAI $executor) >= @token:amount(ETH 1.5)",
      "assert @token:allowance!(XDAI $executor $executor) == 5",
      // Another chain's currency is a bare word here.
      "assert @balance!(ETH $executor) >= 5",
    ]) {
      expect(() => wellFormed(withLine(line)), line).toThrow(
        "a bare token symbol",
      );
    }
  });
});
