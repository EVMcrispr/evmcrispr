import "../../setup";
import { encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { WXDAI } from "../../fixtures";

describeCommand("wrap", {
  describeName: "Swaps > commands > wrap <amount>",
  module: "swaps",
  preamble: "load swaps",
  cases: [
    {
      name: "encodes a deposit into the wrapped native token",
      script: "swaps:wrap 1e18",
      expectedActions: [
        encodeAction(WXDAI, "deposit()", [], { value: 10n ** 18n }),
      ],
    },
  ],
  docCases: [
    {
      description: "Wrap 1 xDAI into WXDAI (on Gnosis)",
      code: "swaps:wrap 1e18",
    },
  ],
});

describeCommand("unwrap", {
  describeName: "Swaps > commands > unwrap <amount>",
  module: "swaps",
  preamble: "load swaps",
  cases: [
    {
      name: "encodes a withdrawal from the wrapped native token",
      script: "swaps:unwrap 1e18",
      expectedActions: [
        encodeAction(WXDAI, "withdraw(uint256)", [Num(10n ** 18n)]),
      ],
    },
  ],
  docCases: [
    {
      description: "Unwrap 1 WXDAI back into xDAI (on Gnosis)",
      code: "swaps:unwrap 1e18",
    },
  ],
});
