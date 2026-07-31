import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils/evml";

describeCommand("set-contenthash", {
  describeName: "Ens > commands > set-contenthash <name> <hash>",
  module: "ens",
  preamble: "load ens",
  errorCases: [
    {
      name: "should fail on unsupported chains",
      script:
        'ens:set-contenthash mydao.eth "ipfs://QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4"',
      error: "is not available on",
    },
    {
      name: "should fail with too few arguments",
      script: "ens:set-contenthash mydao.eth",
      error: "invalid number of arguments",
    },
  ],
});
