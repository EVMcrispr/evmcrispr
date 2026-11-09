import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
} from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { bytesToHex, encodeFunctionData, zeroAddress } from "viem";
import type Ens from "..";
import {
  permissionedResolverImplMap,
  requireAddress,
  verifiableFactoryMap,
} from "../addresses";
import {
  ALL_ROLES,
  permissionedResolverAbi,
  verifiableFactoryAbi,
} from "../permissionedResolver";
import { assertSupportedChain } from "../utils";

export default defineCommand<Ens>({
  smartSupport: {
    kind: "static",
    reason:
      "The resolver's address is predicted from its salt and deployer when the script is built.",
  },
  name: "create-resolver",
  description:
    "Deploy an ENSv2 resolver (PermissionedResolver) through ENS's VerifiableFactory and bind its predicted address to <variable>. Its admin (the sender by default) gets every role, so it can set records of any name that uses it.",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the new resolver's address to",
    },
  ],
  opts: [
    {
      name: "admin",
      type: "address",
      description:
        "Account given every role on the resolver (default: the transaction sender)",
    },
    {
      name: "salt",
      type: "bytes32",
      description:
        "Salt of the resolver's address, with the sender (default: random)",
    },
  ],
  async run(module, { variable }, { opts }) {
    const chainId = await module.getChainId();
    assertSupportedChain(chainId);
    const factory = requireAddress(
      verifiableFactoryMap,
      chainId,
      "VerifiableFactory",
    );
    const implementation = requireAddress(
      permissionedResolverImplMap,
      chainId,
      "PermissionedResolver",
    );
    const sender = (await module.getSender()) as Address;
    const admin: Address = opts.admin ?? sender;
    const salt = BigInt(
      (opts.salt as Hex | undefined) ??
        bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    );

    const client = await module.getClient();
    const predicted = await client.readContract({
      address: factory,
      abi: verifiableFactoryAbi,
      functionName: "predictProxyAddress",
      args: [sender, salt],
    });
    if (predicted === zeroAddress) {
      throw new ErrorException("create-resolver: predicted address is zero");
    }
    const code = await client.getCode({ address: predicted });
    if (code && code !== "0x") {
      throw new ErrorException(
        `a resolver already exists at ${predicted} for this sender and salt; choose another --salt`,
      );
    }

    module.bindingsManager.setBinding(
      variable,
      predicted,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    const init = encodeFunctionData({
      abi: permissionedResolverAbi,
      functionName: "initialize",
      args: [[{ account: admin, roleBitmap: ALL_ROLES }], []],
    });
    return [
      encodeAction(factory, "deployProxy(address,uint256,bytes)", [
        implementation,
        salt,
        init,
      ]),
    ];
  },
});
