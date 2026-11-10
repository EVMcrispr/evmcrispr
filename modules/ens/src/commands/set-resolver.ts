import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Ens from "..";
import { nameWrapperMap, registryMap, requireAddress } from "../addresses";
import { v2Name } from "../ethRegistry";
import { assertSupportedChain, getNode, isWrapped } from "../utils";

export default defineCommand<Ens>({
  smartSupport: { kind: "runtime" },
  name: "set-resolver",
  description: "Set the resolver contract of an ENS name.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    {
      name: "resolver",
      runtime: true,
      type: "address",
      description: "Resolver address",
    },
  ],
  async run(module, { name, resolver }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const v2 = await v2Name(client, chainId, name);
    if (v2) {
      // ENSv2: the name's resolver is set on its registry token, by an
      // account with the set-resolver role (the owner gets it at registration).
      return [
        encodeAction(v2.registry, "setResolver(uint256,address)", [
          v2.tokenId,
          resolver,
        ]),
      ];
    }
    const node = getNode(name);
    const target = (await isWrapped(client, chainId, node))
      ? requireAddress(nameWrapperMap, chainId, "NameWrapper")
      : requireAddress(registryMap, chainId, "registry");
    return [
      encodeAction(target, "setResolver(bytes32,address)", [node, resolver]),
    ];
  },
});
