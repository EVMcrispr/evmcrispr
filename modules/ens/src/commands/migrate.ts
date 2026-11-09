import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { encodeAbiParameters, labelhash, parseAbi, zeroAddress } from "viem";
import type Ens from "..";
import {
  baseRegistrarMap,
  ethRegistryMap,
  lockedMigrationControllerMap,
  nameWrapperMap,
  registryMap,
  requireAddress,
  unlockedMigrationControllerMap,
} from "../addresses";
import { V2_STATUS, registryAbi as v2RegistryAbi } from "../ethRegistry";
import { CANNOT_UNWRAP, OWNER_FUSES } from "../fuses";
import {
  assertSupportedChain,
  eth2LDLabel,
  getNode,
  getWrappedData,
  isEth2LD,
  isWrapped,
  registryAbi,
} from "../utils";

const baseRegistrarAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function nameExpires(uint256 id) view returns (uint256)",
]);

/** `LibMigration.Data`, the payload a migration controller takes (verified
 *  on Sourcify, the same on mainnet and sepolia). */
const MIGRATION_DATA = [
  {
    type: "tuple",
    components: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "subregistry", type: "address" },
      { name: "resolver", type: "address" },
    ],
  },
] as const;

export default defineCommand<Ens>({
  smartSupport: {
    kind: "static",
    reason:
      "The name's ENS v1 state decides which controller and token the migration goes through when the script is built.",
  },
  name: "migrate",
  description:
    "Move a .eth name from ENS v1 to ENSv2: its owner transfers it to ENSv2's migration controller, which registers it in ENSv2 with the same expiry plus 62 days. Unwrapped and unlocked wrapped names go to the unlocked controller, locked ones (CANNOT_UNWRAP burned) to the locked one.",
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth name to migrate (e.g. mydao.eth)",
    },
  ],
  opts: [
    {
      name: "owner",
      type: "address",
      description: "Owner of the name on ENSv2 (default: its owner on ENS v1)",
    },
    {
      name: "resolver",
      type: "address",
      description:
        "Resolver of the name on ENSv2 (default: its ENS v1 resolver, so its records still resolve)",
    },
    {
      name: "subregistry",
      type: "address",
      description:
        "Registry of the name's subnames on ENSv2 (default: none; not for locked names, whose controller creates one)",
    },
  ],
  async run(module, { name }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    if (!isEth2LD(name)) {
      throw new ErrorException(
        `${name} is not a .eth name: only .eth names migrate (their subnames move with them)`,
      );
    }
    const client = await module.getClient();
    const label = eth2LDLabel(name);
    const id = BigInt(labelhash(label));
    const node = getNode(name);

    const { status } = await client.readContract({
      address: requireAddress(ethRegistryMap, chainId, "ETHRegistry"),
      abi: v2RegistryAbi,
      functionName: "getState",
      args: [id],
    });
    if (status === V2_STATUS.REGISTERED) {
      throw new ErrorException(`${name} is already on ENSv2`);
    }
    if (status !== V2_STATUS.RESERVED) {
      throw new ErrorException(`${name} is not registered on ENS v1`);
    }

    const baseRegistrar = requireAddress(
      baseRegistrarMap,
      chainId,
      "BaseRegistrar",
    );
    const expires = await client.readContract({
      address: baseRegistrar,
      abi: baseRegistrarAbi,
      functionName: "nameExpires",
      args: [id],
    });
    const { timestamp } = await client.getBlock();
    if (expires <= timestamp) {
      throw new ErrorException(
        `${name} expired on ENS v1 and is in its grace period: renew it (ens:renew) before migrating it`,
      );
    }

    const wrapped = await isWrapped(client, chainId, node);
    const wrapper = wrapped
      ? await getWrappedData(client, chainId, node)
      : undefined;
    if (wrapper && (wrapper.fuses & OWNER_FUSES["cannot-transfer"]) !== 0) {
      throw new ErrorException(
        `${name} cannot be migrated: its CANNOT_TRANSFER fuse is burned, and a migration is a transfer to ENSv2's controller`,
      );
    }
    const locked = !!wrapper && (wrapper.fuses & CANNOT_UNWRAP) !== 0;
    if (locked && opts.subregistry !== undefined) {
      throw new ErrorException(
        `${name} is locked (CANNOT_UNWRAP burned): its migration creates its subregistry, so --subregistry does not apply`,
      );
    }
    const owner: Address = wrapper
      ? wrapper.owner
      : await client.readContract({
          address: baseRegistrar,
          abi: baseRegistrarAbi,
          functionName: "ownerOf",
          args: [id],
        });
    const resolver: Address =
      opts.resolver ??
      (await client.readContract({
        address: requireAddress(registryMap, chainId, "registry"),
        abi: registryAbi,
        functionName: "resolver",
        args: [node],
      }));

    const data = encodeAbiParameters(MIGRATION_DATA, [
      {
        label,
        owner: opts.owner ?? owner,
        subregistry: opts.subregistry ?? zeroAddress,
        resolver,
      },
    ]);
    const controller = requireAddress(
      locked ? lockedMigrationControllerMap : unlockedMigrationControllerMap,
      chainId,
      locked ? "LockedMigrationController" : "UnlockedMigrationController",
    );

    // The owner hands the name's token to the controller; the sender is the
    // owner (or approved by it).
    if (wrapped) {
      return [
        encodeAction(
          requireAddress(nameWrapperMap, chainId, "NameWrapper"),
          "safeTransferFrom(address,address,uint256,uint256,bytes)",
          [owner, controller, BigInt(node), 1, data],
        ),
      ];
    }
    return [
      encodeAction(
        baseRegistrar,
        "safeTransferFrom(address,address,uint256,bytes)",
        [owner, controller, id, data],
      ),
    ];
  },
});
