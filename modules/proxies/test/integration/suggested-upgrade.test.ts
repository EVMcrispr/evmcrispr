import "../setup";
import { describe, expect, it } from "bun:test";
import { suggestionScript } from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { installAssertionsCore } from "@evmcrispr/test-utils/onchain";
import { getAddress, parseAbi } from "viem";
import { gnosis } from "viem/chains";
import { ADMIN_SLOT, IMPLEMENTATION_SLOT } from "../../src/utils";

/**
 * A real upgrade on the Gnosis fork: Giveth's TokenDistro, a transparent
 * proxy that shows implementation() to its ProxyAdmin only, re-upgraded to
 * its own implementation by the ProxyAdmin's owner. The run suggests the
 * implementation check, through the route the assertion takes (the
 * ProxyAdmin), and the batch with that check in it still passes.
 */
const TOKEN_DISTRO = getAddress("0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1");
const tag = evml.with({
  account: TEST_ACCOUNT_ADDRESS,
  chainId: gnosis.id,
  transports: getTransports(),
});
const client = getPublicClient();
await installAssertionsCore(client);

const slot = async (s: `0x${string}`) =>
  getAddress(
    `0x${(await client.getStorageAt({ address: TOKEN_DISTRO, slot: s }))!.slice(-40)}`,
  );

describe("Proxies > an upgrade's suggested check", () => {
  it("is offered through the ProxyAdmin, and holds", async () => {
    const [admin, implementation] = await Promise.all([
      slot(ADMIN_SLOT),
      slot(IMPLEMENTATION_SLOT),
    ]);
    const owner = await client.readContract({
      address: admin,
      abi: parseAbi(["function owner() view returns (address)"]),
      functionName: "owner",
    });
    const block = `exec ${admin} "upgrade(address,address)" ${TOKEN_DISTRO} ${implementation}`;
    const result = await tag
      .script(block)
      .simulate({ using: "ethereumjs", from: owner, suggest: true });
    expect(result.error).toBeUndefined();
    const upgraded = result.suggestions!.filter((s) => s.event === "upgraded");
    expect(upgraded.map((s) => s.line)).toEqual([
      "assert @proxies:implementation!($proxy) == $implementation",
    ]);
    const checked = await tag
      .script(`${suggestionScript(upgraded)}\n${block}`)
      .simulate({ using: "ethereumjs", from: owner });
    expect(checked.error).toBeUndefined();
  }, 240000);
});
