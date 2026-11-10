import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "static",
    reason:
      "Only exact static delegatecalls are supported; the composability executor cannot represent dynamic delegatecalls.",
  },
  name: "delegate-exec",
  description:
    "Call a contract function via DELEGATECALL from the Safe. The code runs in the storage context of the Safe — only use audited libraries you trust.",
  args: [
    {
      name: "contractAddress",
      type: "address",
      description: "Target library/contract address",
    },
    {
      name: "signature",
      type: "write-abi",
      description: 'Function signature (e.g. `"signMessage(bytes)"`)',
    },
    {
      name: "params",
      type: "any",
      description: "Arguments matching the signature types",
      rest: true,
    },
  ],
  async run(module, { contractAddress, signature, params }, { interpreters }) {
    // Outside a Safe block only a simulation can make the delegatecall: it
    // runs as the account the fork impersonates (`sim:fork --as $safe`).
    if (!module.currentSafe && !interpreters.simulation) {
      throw new ErrorException(
        "safe:delegate-exec can only be used inside a safe:propose or safe:execute block, or inside sim:fork as the Safe",
      );
    }

    return [
      { ...encodeAction(contractAddress, signature, params), operation: 1 },
    ];
  },
});
