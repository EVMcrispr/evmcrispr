import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Ens from "..";
import { assertSupportedChain, getNode, getRegistryResolver } from "../utils";

export default defineCommand<Ens>({
  name: "set-addr",
  description: "Set the address record of an ENS name.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    { name: "address", type: "address", description: "Address to set" },
    {
      name: "coinType",
      type: "number",
      optional: true,
      description:
        "ENSIP-9/11 coin type (defaults to 60, ETH; e.g. @coinType(optimism); only EVM-style addresses are supported)",
    },
  ],
  async run(module, { name, address, coinType }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const node = getNode(name);
    const resolver = await getRegistryResolver(client, chainId, node, name);

    if (coinType !== undefined) {
      return [
        encodeAction(resolver, "setAddr(bytes32,uint256,bytes)", [
          node,
          coinType,
          address,
        ]),
      ];
    }

    return [
      encodeAction(resolver, "setAddr(bytes32,address)", [node, address]),
    ];
  },
});
