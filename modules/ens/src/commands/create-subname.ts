import {
  defineCommand,
  ErrorException,
  encodeAction,
  normalizeEnsName,
} from "@evmcrispr/sdk";
import { labelhash } from "viem";
import { normalize } from "viem/ens";
import type Ens from "..";
import { nameWrapperMap, registryMap, requireAddress } from "../addresses";
import { validateFusePrereqs } from "../fuses";
import {
  assertSupportedChain,
  getNode,
  getWrappedData,
  isWrapped,
  registryAbi,
} from "../utils";

export default defineCommand<Ens>({
  name: "create-subname",
  description: "Create a subname under an ENS name you own.",
  args: [
    {
      name: "parent",
      type: "string",
      description: "Parent ENS name (e.g. mydao.eth)",
    },
    {
      name: "label",
      type: "string",
      description: "Subname label (e.g. vault for vault.mydao.eth)",
    },
    { name: "owner", type: "address", description: "Owner of the subname" },
  ],
  opts: [
    {
      name: "resolver",
      type: "address",
      description: "Resolver for the subname (defaults to the parent's)",
    },
    {
      name: "fuses",
      type: "number",
      description:
        "Fuses to burn on the subname (wrapped parents only; use @ens.fuses)",
    },
    {
      name: "expiry",
      type: "number",
      description: "Subname expiry timestamp (wrapped parents only)",
    },
  ],
  async run(module, { parent, label, owner }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const parentNode = getNode(parent);
    const normalizedLabel = normalize(label);

    const resolver =
      opts.resolver ??
      (await client.readContract({
        address: requireAddress(registryMap, chainId, "registry"),
        abi: registryAbi,
        functionName: "resolver",
        args: [parentNode],
      }));

    if (await isWrapped(client, chainId, parentNode)) {
      const fuses = Number(opts.fuses ?? 0);
      if (fuses) {
        const subNode = getNode(
          `${normalizedLabel}.${normalizeEnsName(parent)}`,
        );
        const { fuses: currentFuses } = await getWrappedData(
          client,
          chainId,
          subNode,
        );
        validateFusePrereqs(fuses, currentFuses, { isChild: true });
      }
      return [
        encodeAction(
          requireAddress(nameWrapperMap, chainId, "NameWrapper"),
          "setSubnodeRecord(bytes32,string,address,address,uint64,uint32,uint64)",
          [
            parentNode,
            normalizedLabel,
            owner,
            resolver,
            0,
            fuses,
            opts.expiry ?? 0,
          ],
        ),
      ];
    }

    if (opts.fuses !== undefined || opts.expiry !== undefined) {
      throw new ErrorException(
        "--fuses and --expiry only apply to wrapped names; wrap the parent first with ens:wrap",
      );
    }

    return [
      encodeAction(
        requireAddress(registryMap, chainId, "registry"),
        "setSubnodeRecord(bytes32,bytes32,address,address,uint64)",
        [parentNode, labelhash(normalizedLabel), owner, resolver, 0],
      ),
    ];
  },
});
