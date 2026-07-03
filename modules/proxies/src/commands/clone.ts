import { BindingsSpace, defineCommand } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { concatHex, getContractAddress, pad } from "viem";
import type Proxies from "..";
import { ARACHNID_CREATE2, cloneInitCode } from "../utils";

export default defineCommand<Proxies>({
  name: "clone",
  description:
    "Deploy an ERC-1167 minimal proxy (clone) of an implementation contract. Binds the predicted clone address to <variable>. Pass --salt for a deterministic CREATE2 deployment.",
  batchable: (_args, opts) =>
    opts.salt !== undefined
      ? true
      : "plain CREATE clones cannot be batched (use --salt for CREATE2)",
  args: [
    {
      name: "variable",
      type: "variable",
      description: "Variable to bind the clone address to",
    },
    {
      name: "implementation",
      type: "address",
      description: "Implementation contract the clone delegates to",
    },
  ],
  opts: [
    {
      name: "salt",
      type: "bytes32",
      description:
        "Salt for deterministic CREATE2 deployment through the Arachnid deployer (override with --via)",
    },
    {
      name: "via",
      type: "address",
      description: "Override the CREATE2 factory address used with --salt",
    },
    {
      name: "from",
      type: "address",
      description:
        "Sender address. Defaults to the connected wallet. For plain CREATE this is also the prediction deployer.",
    },
  ],
  async run(module, { variable, implementation }, { opts }) {
    const initCode = cloneInitCode(implementation as Address);
    const from =
      (opts.from as Address | undefined) ??
      (await module.getConnectedAccount());

    let predicted: Address;
    let action: { to?: Address; data: Hex; from: Address };

    if (opts.salt !== undefined) {
      const salt = pad(opts.salt as Hex, { size: 32 });
      const factory = (opts.via as Address | undefined) ?? ARACHNID_CREATE2;
      predicted = getContractAddress({
        opcode: "CREATE2",
        from: factory,
        salt,
        bytecode: initCode,
      });
      action = { to: factory, data: concatHex([salt, initCode]), from };
    } else {
      const nonce = BigInt(await module.incrementNonce(from));
      predicted = getContractAddress({ from, nonce });
      action = { data: initCode, from };
    }

    module.bindingsManager.setBinding(
      variable,
      predicted,
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );

    return [action];
  },
});
