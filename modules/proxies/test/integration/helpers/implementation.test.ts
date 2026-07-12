import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { GNO, GNO_IMPLEMENTATION, SOME_ADDRESS } from "../../fixtures";

describeHelper(
  "@proxies:implementation",
  {
    describeName: "Proxies > helpers > @proxies:implementation(proxy)",
    module: "proxies",
    cases: [
      {
        name: "should read the ERC-1967 implementation slot",
        input: `@proxies:implementation(${GNO})`,
        expected: GNO_IMPLEMENTATION,
      },
    ],
    errorCases: [
      {
        name: "should fail on non-proxy addresses",
        input: `@proxies:implementation(${SOME_ADDRESS})`,
        error: "is not an ERC-1967 proxy",
      },
    ],
  },
  helpers.implementation.argDefs,
);
