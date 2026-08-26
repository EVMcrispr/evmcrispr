import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { CHECKER } from "../../fixtures";

// Gas Tank reads always go to Polygon, whatever chain the script is on —
// these run from the gnosis default.
describeHelper("@gelato:balance", {
  module: "gelato",
  cases: [
    {
      name: "reads a sponsor's tank balance from Polygon",
      input: `@gelato:balance(${CHECKER})`,
      validate: (value: unknown) => {
        expect(BigInt(String(value)) >= 0n).to.eq(true);
      },
    },
  ],
  docCases: [
    {
      description: "Check how much USDC a sponsor still has in the Gas Tank",
      code: `set $tank @gelato:balance(0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71)`,
    },
  ],
});

describeHelper("@gelato:withdrawn", {
  module: "gelato",
  cases: [
    {
      name: "reads a sponsor's total withdrawals from Polygon",
      input: `@gelato:withdrawn(${CHECKER})`,
      validate: (value: unknown) => {
        expect(BigInt(String(value)) >= 0n).to.eq(true);
      },
    },
  ],
  docCases: [
    {
      description: "Total USDC a sponsor has taken back out of the Gas Tank",
      code: `set $out @gelato:withdrawn(0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71)`,
    },
  ],
});
