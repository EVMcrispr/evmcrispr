import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const EOA = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describeParity("@contracts", {
  module: "contracts",
  helpers,
  cases: [
    {
      // A build-time snapshot against a live EXTCODECOPY. They agree on a
      // fork that does not move; the reason to prefer the `!` face is that it
      // also sees code a batch deployed in an earlier step.
      name: "codeAt reads the runtime code of a contract",
      run: `@contracts:codeAt(${WXDAI})`,
      compile: `@contracts:codeAt!(${WXDAI})`,
    },
    {
      name: "codeAt of an account with no code is empty",
      run: `@contracts:codeAt(${EOA})`,
      compile: `@contracts:codeAt!(${EOA})`,
    },
  ],
});
