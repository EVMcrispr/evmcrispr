import type { Address } from "viem";
import { parseAbiItem } from "viem";
import type { Module } from "../Module";
import type { Action } from "../types";
import { encodeAction } from "../utils/encoders";
import { Num } from "../utils/Num";
import { getSmartCompileContext } from "./smart";
import { amountParam, type SmartAmount } from "./smart-amounts";
import { isRuntimeValue } from "./smart-types";

const allowanceAbi = parseAbiItem(
  "function allowance(address owner, address spender) view returns (uint256)",
);

/**
 * Actions needed so `spender` can pull `needed` of `token` from `owner`:
 * nothing when the current allowance suffices, an exact-amount approve when
 * it does not, plus a zero-reset first for USDT-style tokens that revert
 * on nonzero -> nonzero approvals.
 */
export async function buildApprovalActions(
  module: Module,
  token: Address,
  owner: Address,
  spender: Address,
  needed: SmartAmount,
): Promise<Action[]> {
  const ctx = getSmartCompileContext(module);
  if (ctx) {
    const amount = isRuntimeValue(needed)
      ? await ctx.interpreters.batchContext!.smartState!.snapshot(ctx, needed)
      : needed;
    return [
      encodeAction(token, "approve(address,uint256)", [
        spender,
        Num.fromBigInt(0n),
      ]),
      encodeAction(token, "approve(address,uint256)", [
        spender,
        amountParam(amount),
      ]),
    ];
  }
  if (isRuntimeValue(needed))
    throw new Error("runtime approval requires a smart batch");
  const client = await module.getClient();
  const allowance = await client.readContract({
    address: token,
    abi: [allowanceAbi],
    functionName: "allowance",
    args: [owner, spender],
  });

  if (allowance >= needed) return [];

  const actions: Action[] = [];
  if (allowance > 0n) {
    actions.push(
      encodeAction(token, "approve(address,uint256)", [
        spender,
        Num.fromBigInt(0n),
      ]),
    );
  }
  actions.push(
    encodeAction(token, "approve(address,uint256)", [
      spender,
      Num.fromBigInt(needed),
    ]),
  );
  return actions;
}
