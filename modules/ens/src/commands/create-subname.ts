import {
  defineCommand,
  ErrorException,
  encodeAction,
  normalizeEnsName,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { encodeFunctionData, labelhash, zeroAddress } from "viem";
import { normalize } from "viem/ens";
import type Ens from "..";
import {
  nameWrapperMap,
  registryMap,
  requireAddress,
  userRegistryImplMap,
} from "../addresses";
import {
  OWNER_ROLES,
  userRegistryAbi,
  v2Name,
  v2Subregistry,
} from "../ethRegistry";
import { validateFusePrereqs } from "../fuses";
import {
  assertSupportedChain,
  getNode,
  getWrappedData,
  isWrapped,
  registryAbi,
} from "../utils";
import { ALL_ROLES, factoryDeployment } from "../verifiableFactory";

const YEAR = 365n * 24n * 60n * 60n;

export default defineCommand<Ens>({
  smartSupport: { kind: "runtime" },
  name: "create-subname",
  experimental: true,
  description:
    "Create a subname under an ENS name you own. Under an ENSv2 name it registers the subname in the name's subregistry, deploying and attaching one first when the name has none.",
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
    {
      name: "owner",
      type: "address",
      runtime: true,
      description: "Owner of the subname",
    },
  ],
  opts: [
    {
      name: "resolver",
      type: "address",
      runtime: true,
      description: "Resolver for the subname (defaults to the parent's)",
    },
    {
      name: "fuses",
      type: "number",
      description:
        "Fuses to burn on the subname (wrapped parents only; use @ens:fuses)",
    },
    {
      name: "expiry",
      runtime: true,
      type: "number",
      description:
        "Subname expiry timestamp (wrapped and ENSv2 parents; ENSv2 default: a year from now)",
    },
  ],
  async run(module, { parent, label, owner }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const client = await module.getClient();
    const parentNode = getNode(parent);
    const normalizedLabel = normalize(label);

    const v2 = await v2Name(client, chainId, parent);
    if (v2) {
      if (opts.fuses !== undefined) {
        throw new ErrorException(
          "--fuses do not apply to ENSv2 names: their subnames get roles, not fuses",
        );
      }
      const actions = [];
      let registry = await v2Subregistry(client, v2);
      if (registry === zeroAddress) {
        // The parent's own registry of subnames, with the sender holding
        // every role on it (it registers the subname right after), as the
        // ENS app does; attached to the parent's token.
        const sender = (await module.getSender()) as Address;
        const deployment = await factoryDeployment(
          module,
          chainId,
          requireAddress(userRegistryImplMap, chainId, "UserRegistry"),
          encodeFunctionData({
            abi: userRegistryAbi,
            functionName: "initialize",
            args: [[{ account: sender, roleBitmap: ALL_ROLES }]],
          }),
          sender,
        );
        actions.push(
          deployment.action,
          encodeAction(v2.registry, "setSubregistry(uint256,address)", [
            v2.tokenId,
            deployment.address,
          ]),
        );
        registry = deployment.address;
      }
      const expiry = opts.expiry ?? (await client.getBlock()).timestamp + YEAR;
      actions.push(
        encodeAction(
          registry,
          "register(string,address,address,address,uint256,uint64)",
          [
            normalizedLabel,
            owner,
            zeroAddress,
            opts.resolver ?? v2.resolver,
            OWNER_ROLES,
            expiry,
          ],
        ),
      );
      return actions;
    }

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
