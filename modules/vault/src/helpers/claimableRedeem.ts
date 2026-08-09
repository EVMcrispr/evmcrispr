import { defineHelper } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Vault from "..";
import { erc7540Abi, readVault7540Uint } from "../erc7540";

export default defineHelper<Vault>({
  name: "claimableRedeem",
  batchable: false,
  description:
    "Shares of a fulfilled redemption request claimable from an ERC-7540 vault, in base units of the share. As @claimableRedeem! the claimableRedeemRequest read happens on-chain at assertion time.",
  returnType: "number",
  args: [
    {
      name: "vault",
      type: "address",
      description: "ERC-7540 vault address",
    },
    {
      name: "controller",
      type: "address",
      optional: true,
      description:
        "Controller of the request (defaults to the connected account)",
    },
    {
      name: "requestId",
      type: "number",
      optional: true,
      description:
        "Request id (defaults to 0, the controller-keyed convention)",
    },
  ],
  async run(module, { vault, controller, requestId }) {
    const account = controller ?? (await module.getConnectedAccount(true));
    return (
      await readVault7540Uint(module, vault, "claimableRedeemRequest", [
        BigInt(requestId ?? 0),
        account,
      ])
    ).toString();
  },
  compile: async (ctx, node) => {
    const vault = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    const controller = node.args[1] ?? {
      value: await ctx.module.getConnectedAccount(true),
    };
    const requestId = node.args[2] ?? { value: 0n };
    return callReadOperand(
      ctx,
      vault,
      getAbiItem({
        abi: erc7540Abi,
        name: "claimableRedeemRequest",
      }) as AbiFunction,
      [requestId, controller],
      "Uint",
    );
  },
});
