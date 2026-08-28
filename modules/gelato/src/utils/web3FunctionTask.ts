import type { Module } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { toFunctionSelector } from "viem";
import { opsProxyFactoryAbi } from "../abis";
import { OPS_PROXY_FACTORY_ADDRESS } from "../addresses";

/** OpsProxy.batchExecuteCall — what a Web3 Function task executes through
 *  the dedicated msg.sender: the function returns the calls, the proxy
 *  makes them. */
export const BATCH_EXECUTE_CALL: Hex = toFunctionSelector(
  "batchExecuteCall(address[],bytes[],uint256[])",
);

/** The dedicated msg.sender Gelato assigns `account` (the connected one by
 *  default) on this chain — deterministic, so known before deployment. */
export async function dedicatedMsgSender(
  module: Module,
  account?: Address,
): Promise<Address> {
  const owner = account ?? (await module.getConnectedAccount());
  const client = await module.getClient();
  return client.readContract({
    address: OPS_PROXY_FACTORY_ADDRESS,
    abi: opsProxyFactoryAbi,
    functionName: "determineProxyAddress",
    args: [owner],
  });
}

/** Exec target and selector of a Web3 Function task. */
export async function web3FunctionExec(
  module: Module,
): Promise<{ execAddress: Address; execData: Hex }> {
  return {
    execAddress: await dedicatedMsgSender(module),
    execData: BATCH_EXECUTE_CALL,
  };
}
