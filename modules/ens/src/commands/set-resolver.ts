import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Ens from "..";
import { nameWrapperMap, registryMap, requireAddress } from "../addresses";
import { assertSupportedChain, getNode, isWrapped } from "../utils";

export default defineCommand<Ens>({
  name: "set-resolver",
  description: "Set the resolver contract of an ENS name.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    { name: "resolver", type: "address", description: "Resolver address" },
  ],
  async run(module, { name, resolver }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const node = getNode(name);
    const target = (await isWrapped(client, chainId, node))
      ? requireAddress(nameWrapperMap, chainId, "NameWrapper")
      : requireAddress(registryMap, chainId, "registry");
    return [
      encodeAction(target, "setResolver(bytes32,address)", [node, resolver]),
    ];
  },
});
