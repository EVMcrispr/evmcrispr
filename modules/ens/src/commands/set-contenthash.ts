import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Ens from "..";
import {
  assertSupportedChain,
  encodeContenthash,
  getNode,
  getRegistryResolver,
} from "../utils";

export default defineCommand<Ens>({
  name: "set-contenthash",
  description: "Set the content hash of an ENS name.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    {
      name: "hash",
      type: "string",
      description:
        'Content hash ("ipfs://Qm…", "ipns://…", "skynet://…" or encoded 0x bytes)',
    },
  ],
  async run(module, { name, hash }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const node = getNode(name);
    const resolver = await getRegistryResolver(client, chainId, node, name);
    return [
      encodeAction(resolver, "setContenthash(bytes32,bytes)", [
        node,
        encodeContenthash(hash),
      ]),
    ];
  },
});
