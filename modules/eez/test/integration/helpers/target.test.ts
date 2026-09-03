import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddressEqual } from "viem";
import { helpers } from "../../../src/_generated";
import { devnet } from "../../devnet";

/** A target whose L1 proxy the eez:on suite makes sure exists, and
 *  that proxy (CREATE2 from the L1 registry, so stable across runs). */
const KNOWN = "0x000000000000000000000000000000000000bEEF";
const KNOWN_PROXY = "0xCb9641A63964cD724A7408D29E3Cdab5BB6c242A";

describeHelper(
  "@eez:target",
  {
    module: "eez",
    skip: !devnet,
    cases: [
      {
        name: "reads the target behind a proxy on the named chain",
        input: `@eez:target(eezL1 ${KNOWN_PROXY})`,
        validate: (result) => {
          expect(isAddressEqual(result, KNOWN)).to.be.true;
        },
      },
    ],
    errorCases: [
      {
        name: "refuses an address that is not a proxy",
        input: `@eez:target(eezL1 ${KNOWN})`,
        error: "is not a cross-chain proxy",
      },
    ],
    docCases: [
      {
        description: "Which rollup contract does this L1 proxy stand in for?",
        code: "switch eezL1\nprint @eez:target(eezL1 0xCb9641A63964cD724A7408D29E3Cdab5BB6c242A)",
      },
    ],
  },
  helpers.target.argDefs,
);
