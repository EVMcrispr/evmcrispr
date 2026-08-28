import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import type { Address } from "viem";
import { createPublicClient, http } from "viem";
import { anvilUrl } from "../../../../scripts/anvil-config";
import { opsProxyFactoryAbi } from "../../src/abis";
import { OPS_PROXY_FACTORY } from "../fixtures";

/** The dedicated msg.sender of the test account on the forked chain. */
export async function dedicatedMsgSenderOf(
  account: Address = TEST_ACCOUNT_ADDRESS,
): Promise<Address> {
  const client = createPublicClient({ transport: http(anvilUrl()) });
  return client.readContract({
    address: OPS_PROXY_FACTORY,
    abi: opsProxyFactoryAbi,
    functionName: "determineProxyAddress",
    args: [account],
  });
}
