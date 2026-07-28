import {
  defineCommand,
  ErrorException,
  encodeAction,
  Num,
  normalizeEnsName,
} from "@evmcrispr/sdk";
import { labelhash } from "viem";
import type Ens from "..";
import { nameWrapperMap, requireAddress } from "../addresses";
import { encodeFuses, hasParentFuses, validateFusePrereqs } from "../fuses";
import {
  assertSupportedChain,
  getNode,
  getWrappedData,
  isWrapped,
} from "../utils";

export default defineCommand<Ens>({
  name: "set-fuses",
  experimental: true,
  description: "Burn NameWrapper fuses on a wrapped ENS name.",
  args: [
    {
      name: "name",
      type: "string",
      description: "Wrapped ENS name (e.g. vault.mydao.eth)",
    },
    {
      name: "fuse",
      type: "fuse",
      description: "Fuse name to burn (e.g. cannot-unwrap)",
    },
    {
      name: "moreFuses",
      type: "fuse",
      rest: true,
      description: "Additional fuse names to burn",
    },
  ],
  opts: [
    {
      name: "expiry",
      type: "number",
      description:
        "New expiry timestamp (parent-controlled fuses only; defaults to the current expiry)",
    },
  ],
  async run(module, { name, fuse, moreFuses }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const node = getNode(name);

    if (!(await isWrapped(client, chainId, node))) {
      throw new ErrorException(
        `${name} is not wrapped; wrap it first with ens:wrap`,
      );
    }

    const fuses = encodeFuses([fuse, ...moreFuses]);
    const { fuses: currentFuses } = await getWrappedData(client, chainId, node);
    const nameWrapper = requireAddress(nameWrapperMap, chainId, "NameWrapper");

    if (hasParentFuses(fuses)) {
      // Parent-controlled fuses are burned by the parent's owner.
      validateFusePrereqs(fuses, currentFuses, { isChild: true });
      const labels = normalizeEnsName(name).split(".");
      if (labels.length < 2) {
        throw new ErrorException(
          "parent-controlled fuses can only be burned on subnames",
        );
      }
      const parentNode = getNode(labels.slice(1).join("."));
      return [
        encodeAction(
          nameWrapper,
          "setChildFuses(bytes32,bytes32,uint32,uint64)",
          [
            parentNode,
            labelhash(labels[0]),
            Num.fromBigInt(BigInt(fuses)),
            opts.expiry ?? Num.fromBigInt(0n),
          ],
        ),
      ];
    }

    validateFusePrereqs(fuses, currentFuses);
    return [
      encodeAction(nameWrapper, "setFuses(bytes32,uint16)", [
        node,
        Num.fromBigInt(BigInt(fuses)),
      ]),
    ];
  },
});
