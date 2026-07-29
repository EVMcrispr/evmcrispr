import { defineCommand, encodeAction, normalizeEnsName } from "@evmcrispr/sdk";
import { labelhash } from "viem";
import type Ens from "..";
import { nameWrapperMap, requireAddress } from "../addresses";
import { assertSupportedChain, eth2LDLabel, getNode, isEth2LD } from "../utils";

export default defineCommand<Ens>({
  name: "unwrap",
  experimental: true,
  description: "Unwrap an ENS name from the NameWrapper.",
  args: [
    {
      name: "name",
      type: "string",
      description: "Wrapped ENS name (e.g. mydao.eth)",
    },
  ],
  async run(module, { name }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const nameWrapper = requireAddress(nameWrapperMap, chainId, "NameWrapper");
    const owner = await module.getConnectedAccount();

    if (isEth2LD(name)) {
      return [
        encodeAction(nameWrapper, "unwrapETH2LD(bytes32,address,address)", [
          labelhash(eth2LDLabel(name)),
          owner,
          owner,
        ]),
      ];
    }

    const labels = normalizeEnsName(name).split(".");
    const parentNode = getNode(labels.slice(1).join("."));
    return [
      encodeAction(nameWrapper, "unwrap(bytes32,bytes32,address)", [
        parentNode,
        labelhash(labels[0]),
        owner,
      ]),
    ];
  },
});
