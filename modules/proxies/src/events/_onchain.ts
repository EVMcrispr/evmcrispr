import { type SuggestEnv, sameValue } from "@evmcrispr/sdk";
import { CORE_ADDRESS } from "@evmcrispr/sdk/onchain";
import { type Address, getAddress } from "viem";
import { ADMIN_SLOT } from "../utils";

/**
 * Whether `@proxies:implementation!(proxy)` reads `implementation` when the
 * assertion runs, by the routes its on-chain face takes: the proxy's
 * ProxyAdmin, when it reports it, or `implementation()` as the Assertions
 * core calls it. An eth_call from address zero is not enough: Optimism's
 * proxies answer zero as they answer their admin, and forward the core to
 * the implementation, which reverts. A check that would certainly fail is
 * not suggested.
 */
export async function implementationReadable(
  env: SuggestEnv,
  proxy: Address,
  implementation: Address,
): Promise<boolean> {
  const word = await env.storageAt?.(proxy, ADMIN_SLOT);
  if (word && BigInt(word) !== 0n) {
    const admin = getAddress(`0x${word.slice(-40)}`);
    const reported = await env.read(
      admin,
      "function getProxyImplementation(address) view returns (address)",
      [proxy],
    );
    if (sameValue(reported, implementation)) return true;
  }
  const direct = await env.read(
    proxy,
    "function implementation() view returns (address)",
    [],
    { from: CORE_ADDRESS },
  );
  return sameValue(direct, implementation);
}

/** Whether `@proxies:admin!(proxy)` reads `admin` when the assertion runs:
 *  `admin()` as the Assertions core calls it. */
export async function adminReadable(
  env: SuggestEnv,
  proxy: Address,
  admin: Address,
): Promise<boolean> {
  const direct = await env.read(
    proxy,
    "function admin() view returns (address)",
    [],
    { from: CORE_ADDRESS },
  );
  return sameValue(direct, admin);
}
