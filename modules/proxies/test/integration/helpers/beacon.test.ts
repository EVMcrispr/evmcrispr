import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { GNO } from "../../fixtures";

describeHelper(
  "@proxies:beacon",
  {
    describeName: "Proxies > helpers > @proxies:beacon(proxy)",
    module: "proxies",
    errorCases: [
      {
        name: "should fail on non-beacon proxies",
        input: `@proxies:beacon(${GNO})`,
        error: "has no ERC-1967 beacon",
      },
    ],
  },
  helpers.beacon.argDefs,
);
