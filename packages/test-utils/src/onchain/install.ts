import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import type { Address, Hex, PublicClient } from "viem";

import {
  ASSERTIONS_RUNTIME_BYTECODE,
  OPERATORS_RUNTIME_BYTECODE,
} from "./assertions-bytecode";

export interface InstalledCore {
  core: Address;
  operators: Address;
}

/**
 * Install the Assertions core and the Operators vocabulary on the anvil fork.
 *
 * Both contracts are stateless — no constructor, no storage, no immutables —
 * so writing the runtime code IS the deployment. That is what makes executing
 * a compiled operand cheap enough to do from a test: no funded deployer, no
 * CREATE2 proxy, no dependence on whether the canonical addresses have
 * actually been deployed on the forked chain (they have not).
 *
 * Installs at the canonical addresses by default so no `$assertions:address`
 * override is needed and the compiled calldata is byte-identical to what
 * production emits — the calldata-shape suites deliberately pin fake
 * addresses instead, and would not catch a mistake in the default path.
 *
 * Idempotent but NOT memoized: `anvil_reset` (between packages in
 * scripts/run-integration-tests.ts, and inside `sim:fork`) discards the code,
 * so a cached "already installed" would be wrong. Two local `eth_getCode`
 * calls are cheap enough to pay per test.
 */
export async function installAssertionsCore(
  client: PublicClient,
  at: Partial<InstalledCore> = {},
): Promise<InstalledCore> {
  const core = at.core ?? CORE_ADDRESS;
  const operators = at.operators ?? OPERATORS_ADDRESS;

  await Promise.all([
    putCode(client, core, ASSERTIONS_RUNTIME_BYTECODE),
    putCode(client, operators, OPERATORS_RUNTIME_BYTECODE),
  ]);

  return { core, operators };
}

async function putCode(client: PublicClient, address: Address, code: Hex) {
  if ((await client.getCode({ address })) === code) return;
  await client.request({
    method: "anvil_setCode",
    params: [address, code],
  } as never);
}
