import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { labelhash, parseAbi } from "viem";
import type Ens from "..";
import {
  baseRegistrarMap,
  nameWrapperMap,
  registryMap,
  requireAddress,
} from "../addresses";
import {
  assertSupportedChain,
  eth2LDLabel,
  getNode,
  getWrappedData,
  isEth2LD,
  isWrapped,
} from "../utils";

export default defineCommand<Ens>({
  name: "transfer",
  description:
    "Transfer ownership of an ENS name. For unwrapped .eth names this hands over both the registrant NFT and the Registry controller (reclaim); transferring to the current registrant just reclaims the controller role.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "newOwner", type: "address", description: "New owner address" },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { name, to, newOwner }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const node = getNode(name);

    if (await isWrapped(client, chainId, node)) {
      const { owner } = await getWrappedData(client, chainId, node);
      return [
        encodeAction(
          requireAddress(nameWrapperMap, chainId, "NameWrapper"),
          "safeTransferFrom(address,address,uint256,uint256,bytes)",
          [owner, newOwner, BigInt(node), 1, "0x"],
        ),
      ];
    }

    if (isEth2LD(name)) {
      const baseRegistrar = requireAddress(
        baseRegistrarMap,
        chainId,
        "BaseRegistrar",
      );
      const tokenId = BigInt(labelhash(eth2LDLabel(name)));
      const registrant = await client.readContract({
        address: baseRegistrar,
        abi: parseAbi([
          "function ownerOf(uint256 tokenId) view returns (address)",
        ]),
        functionName: "ownerOf",
        args: [tokenId],
      });
      // The registrant may reclaim() before transferring, so hand over both
      // roles: the Registry controller first, then the registrant NFT.
      // Transferring to the current registrant is a pure reclaim — the NFT
      // hop is skipped.
      const actions = [
        encodeAction(baseRegistrar, "reclaim(uint256,address)", [
          tokenId,
          newOwner,
        ]),
      ];
      if (String(newOwner).toLowerCase() !== registrant.toLowerCase()) {
        actions.push(
          encodeAction(
            baseRegistrar,
            "safeTransferFrom(address,address,uint256)",
            [registrant, newOwner, tokenId],
          ),
        );
      }
      return actions;
    }

    return [
      encodeAction(
        requireAddress(registryMap, chainId, "registry"),
        "setOwner(bytes32,address)",
        [node, newOwner],
      ),
    ];
  },
});
