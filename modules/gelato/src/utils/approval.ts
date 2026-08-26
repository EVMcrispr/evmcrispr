import type { Action, Module } from "@evmcrispr/sdk";
import { encodeAction, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { parseAbiItem } from "viem";

const allowanceAbi = parseAbiItem(
  "function allowance(address owner, address spender) view returns (uint256)",
);

/** An exact-amount approve when the current allowance falls short, else nothing. */
export async function buildApprovalActions(
  module: Module,
  token: Address,
  owner: Address,
  spender: Address,
  needed: bigint,
): Promise<Action[]> {
  const client = await module.getClient();
  const allowance = await client.readContract({
    address: token,
    abi: [allowanceAbi],
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= needed) return [];
  return [
    encodeAction(token, "approve(address,uint256)", [
      spender,
      Num.fromBigInt(needed),
    ]),
  ];
}
