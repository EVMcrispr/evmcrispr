import {
  defineCommand,
  ErrorException,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import { encodeAbiParameters, labelhash, toHex, zeroAddress } from "viem";
import { normalize, packetToBytes } from "viem/ens";
import type Ens from "..";
import {
  baseRegistrarMap,
  nameWrapperMap,
  registryMap,
  requireAddress,
} from "../addresses";
import { PARENT_CANNOT_CONTROL, validateFusePrereqs } from "../fuses";
import { assertSupportedChain, eth2LDLabel, isEth2LD } from "../utils";

export default defineCommand<Ens>({
  name: "wrap",
  experimental: true,
  description: "Wrap an ENS name in the NameWrapper.",
  args: [
    { name: "name", type: "string", description: "ENS name (e.g. mydao.eth)" },
  ],
  opts: [
    {
      name: "resolver",
      type: "address",
      description: "Resolver of the wrapped name",
    },
    {
      name: "fuses",
      type: "number",
      description:
        "Owner-controlled fuses to burn while wrapping (.eth second-level names only; use @ens:fuses)",
    },
  ],
  async run(module, { name }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const nameWrapper = requireAddress(nameWrapperMap, chainId, "NameWrapper");
    const owner = await module.getConnectedAccount();
    const resolver = opts.resolver ?? zeroAddress;

    if (isEth2LD(name)) {
      const label = eth2LDLabel(name);
      const fuses = Number(opts.fuses ?? 0);
      // parent-cannot-control is burned automatically when wrapping .eth 2LDs
      if (fuses) validateFusePrereqs(fuses, PARENT_CANNOT_CONTROL);
      // The NameWrapper wraps on receipt of the registrant NFT
      // (onERC721Received), so no prior approval is needed.
      return [
        encodeAction(
          requireAddress(baseRegistrarMap, chainId, "BaseRegistrar"),
          "safeTransferFrom(address,address,uint256,bytes)",
          [
            owner,
            nameWrapper,
            Num.fromBigInt(BigInt(labelhash(label))),
            encodeAbiParameters(
              [
                { type: "string" },
                { type: "address" },
                { type: "uint16" },
                { type: "address" },
              ],
              [label, owner, fuses, resolver],
            ),
          ],
        ),
      ];
    }

    if (opts.fuses !== undefined) {
      throw new ErrorException(
        "--fuses only applies when wrapping .eth second-level names; burn fuses on other names with ens:set-fuses after wrapping",
      );
    }

    return [
      encodeAction(
        requireAddress(registryMap, chainId, "registry"),
        "setApprovalForAll(address,bool)",
        [nameWrapper, true],
      ),
      encodeAction(nameWrapper, "wrap(bytes,address,address)", [
        toHex(packetToBytes(normalize(name))),
        owner,
        resolver,
      ]),
    ];
  },
});
