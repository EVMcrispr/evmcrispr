import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import type { Address, Hex, PublicClient } from "viem";

import {
  ASSERTIONS_RUNTIME_BYTECODE,
  MOCK_TARGET_RUNTIME_BYTECODE,
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
 * Installs at the canonical addresses, which is where a compiled expression
 * always points: those addresses are baked into the compiler and are no
 * longer overridable, so the calldata a test decodes here is byte-identical
 * to what production emits. The `at` argument exists for a suite that wants
 * the code somewhere else on purpose.
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

/** Where {@link installMockTarget} puts the fixture by default: an address
 *  no fork state ever occupies, stable enough to interpolate into test
 *  scripts. */
export const MOCK_TARGET_ADDRESS: Address =
  "0x00000000000000000000000000000000000f1a7e";

/**
 * Install the contracts repo's MockTarget fixture on the anvil fork — the
 * revert-probe target with known custom errors (`InsufficientBalance(7,100)`
 * via `revertsWithArgs()`, `Unauthorized()` via `revertsUnauthorized()`,
 * `Redirect(address,address[])` via `revertsWithRedirect()`, a string
 * reason via `revertingFunction()`, a bare revert via `revertsBare()`) and
 * `getValue()` returning 42.
 *
 * Unlike the core, MockTarget has one storage slot (`storedValue = 42`,
 * slot 0) that `anvil_setCode` cannot populate, so it is set explicitly.
 * Idempotent for the same reason installAssertionsCore is not memoized.
 */
export async function installMockTarget(
  client: PublicClient,
  at: Address = MOCK_TARGET_ADDRESS,
): Promise<Address> {
  await putCode(client, at, MOCK_TARGET_RUNTIME_BYTECODE);
  await client.request({
    method: "anvil_setStorageAt",
    params: [
      at,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x000000000000000000000000000000000000000000000000000000000000002a",
    ],
  } as never);
  return at;
}
