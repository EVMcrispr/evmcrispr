import { BindingsSpace, defineCommand } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import type Ens from "..";
import { permissionedResolverImplMap, requireAddress } from "../addresses";
import { permissionedResolverAbi } from "../permissionedResolver";
import { assertSupportedChain } from "../utils";
import { ALL_ROLES, factoryDeployment } from "../verifiableFactory";

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
    const sender = (await module.getSender()) as Address;
    const admin: Address = opts.admin ?? sender;
    const { address, action } = await factoryDeployment(
      module,
      chainId,
      requireAddress(
        permissionedResolverImplMap,
        chainId,
        "PermissionedResolver",
      ),
      encodeFunctionData({
        abi: permissionedResolverAbi,
        functionName: "initialize",
        args: [[{ account: admin, roleBitmap: ALL_ROLES }], []],
      }),
      sender,
      opts.salt as Hex | undefined,
    );
    module.bindingsManager.setBinding(
      variable,
      address,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
    return [action];
  },
});
