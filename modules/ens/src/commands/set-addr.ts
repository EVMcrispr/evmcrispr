import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import { smartAddressBytes } from "@evmcrispr/sdk/onchain";
import type Ens from "..";
import { v2Name, v2Resolver } from "../ethRegistry";
import { COIN_TYPE_ETH, dnsName, SET_ADDRESS } from "../permissionedResolver";
import { assertSupportedChain, getNode, getRegistryResolver } from "../utils";

export default defineCommand<Ens>({
  smartSupport: { kind: "runtime" },
  name: "set-addr",
  description: "Set the address record of an ENS name.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    {
      name: "address",
      type: "address",
      runtime: true,
      description: "Address to set",
    },
    {
      name: "coinType",
      type: "number",
      runtime: true,
      optional: true,
      description:
        "ENSIP-9/11 coin type (defaults to 60, ETH; e.g. @coinType(optimism); only EVM-style addresses are supported)",
    },
  ],
  async run(module, { name, address, coinType }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const v2 = await v2Name(client, chainId, name);
    if (v2) {
      const resolver = await v2Resolver(client, name, v2);
      return [
        encodeAction(resolver, SET_ADDRESS, [
          dnsName(name),
          coinType ?? COIN_TYPE_ETH,
          smartAddressBytes(module, address),
        ]),
      ];
    }
    const node = getNode(name);
    const resolver = await getRegistryResolver(client, chainId, node, name);

    if (coinType !== undefined) {
      return [
        encodeAction(resolver, "setAddr(bytes32,uint256,bytes)", [
          node,
          coinType,
          smartAddressBytes(module, address),
        ]),
      ];
    }

    return [
      encodeAction(resolver, "setAddr(bytes32,address)", [node, address]),
    ];
  },
});
