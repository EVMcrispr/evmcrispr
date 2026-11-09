import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { isRuntimeValue } from "@evmcrispr/sdk/onchain";
import { labelhash, parseAbi } from "viem";
import type Ens from "..";
import {
  baseRegistrarMap,
  nameWrapperMap,
  registryMap,
  requireAddress,
} from "../addresses";
import { isEmancipated, v2Name } from "../ethRegistry";
import {
  assertSupportedChain,
  eth2LDLabel,
  getNode,
  getWrappedData,
  isEth2LD,
  isWrapped,
} from "../utils";

export default defineCommand<Ens>({
  smartSupport: { kind: "runtime" },
  name: "transfer",
  description:
    "Transfer ownership of an ENS name. An ENSv2 name (or subname) moves its registry token, with the owner's roles. On ENS v1, an unwrapped .eth name hands over both the registrant NFT and the Registry controller (reclaim); transferring to the current registrant just reclaims the controller role.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "newOwner",
      type: "address",
      runtime: true,
      description: "New owner address",
    },
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

    const v2 = await v2Name(client, chainId, name);
    if (v2) {
      if (
        !isRuntimeValue(newOwner) &&
        String(newOwner).toLowerCase() === v2.owner.toLowerCase()
      ) {
        throw new ErrorException(
          `${name} is already owned by ${v2.owner}; an ENSv2 name has no separate controller to reclaim`,
        );
      }
      // The token carries the owner's roles: the registry moves them with
      // it, and refuses unless the owner may transfer (CAN_TRANSFER_ADMIN,
      // which a registration gives). A subname's registry that is not
      // emancipated refuses safeTransferFrom; it takes unsafeTransfer.
      if (!(await isEmancipated(client, v2.registry))) {
        return [
          encodeAction(v2.registry, "unsafeTransfer(address,uint256,bytes)", [
            newOwner,
            v2.tokenId,
            "0x",
          ]),
        ];
      }
      return [
        encodeAction(
          v2.registry,
          "safeTransferFrom(address,address,uint256,uint256,bytes)",
          [v2.owner, newOwner, v2.tokenId, 1, "0x"],
        ),
      ];
    }

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
      if (
        isRuntimeValue(newOwner) ||
        String(newOwner).toLowerCase() !== registrant.toLowerCase()
      ) {
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
