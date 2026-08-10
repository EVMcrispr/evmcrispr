import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import { getAbiItem, getAddress } from "viem";
import type Vault from "..";
import { erc7540Abi } from "../erc7540";

export default defineHelper<Vault>({
  name: "isOperator",
  batchable: false,
  description:
    "Whether an account is an approved operator of a controller on an ERC-7540 vault.",
  returnType: "bool",
  args: [
    {
      name: "vault",
      type: "address",
      description: "ERC-7540 vault address",
    },
    {
      name: "operator",
      type: "address",
      description: "Operator account to check",
    },
    {
      name: "controller",
      type: "address",
      optional: true,
      description:
        "Controller the operator would act for (defaults to the connected account)",
    },
  ],
  async run(module, { vault, operator, controller }) {
    const account = controller ?? (await module.getConnectedAccount(true));
    const client = await module.getClient();
    try {
      const approved = (await client.readContract({
        address: vault,
        abi: erc7540Abi,
        functionName: "isOperator",
        args: [account, operator],
      })) as boolean;
      return approved.toString();
    } catch {
      throw new ErrorException(
        `${vault} does not look like an ERC-7540 vault (isOperator() reverted or returned no data)`,
      );
    }
  },
  compile: async (ctx, node) => {
    const vault = getAddress(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    const controller = node.args[2] ?? {
      value: await ctx.module.getConnectedAccount(true),
    };
    return callReadOperand(
      ctx,
      vault,
      getAbiItem({ abi: erc7540Abi, name: "isOperator" }) as AbiFunction,
      [controller, node.args[1]],
      "Bool",
    );
  },
});
