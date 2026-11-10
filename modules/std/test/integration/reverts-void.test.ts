import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import { createEvml, Interpreter } from "@evmcrispr/core";
import type { AssertionAction } from "@evmcrispr/sdk/onchain";
import {
  type Address,
  createPublicClient,
  type Hex,
  http,
  numberToHex,
  type PublicClient,
} from "viem";
import { installAssertionsCore } from "../../../../packages/test-utils/src/onchain/install";
import { installConstantMock } from "../../../../packages/test-utils/src/onchain/mock";

// A check that returns nothing and reverts when it does not hold, like
// OptimismPortal2's checkWithdrawal(bytes32,address). The bare probe asks
// whether it reverts; it once refused such a call ("has no return value
// to assert on") and only the `-!>` form took it. A dedicated, unforked
// EVM runs the pinned Assertions bytecode.

let anvil: ReturnType<typeof Bun.spawn>;
let client: PublicClient;
let transport: ReturnType<typeof http>;
const tag = createEvml();

const PASSES: Address = "0x00000000000000000000000000000000000c0001";
const REVERTS: Address = "0x00000000000000000000000000000000000c0002";
// Answers any call with the word 7: a live argument for the checks.
const SEVEN: Address = "0x00000000000000000000000000000000000c0003";
const HASH = `0x${"11".repeat(32)}`;
const WHO = "0x00000000000000000000000000000000000c00ff";

const check = (target: Address, args = `${HASH} ${WHO}`) =>
  `${target}::!{checkWithdrawal(bytes32,address)() ${args}}`;

async function compile(line: string): Promise<AssertionAction> {
  const actions = await new Interpreter(tag.registry, {
    chainId: 1,
    transports: { 1: transport },
  }).interpret(line);
  return actions[0] as AssertionAction;
}

/** Whether the assertion holds on-chain. */
async function holds(line: string): Promise<boolean> {
  const action = await compile(line);
  try {
    await client.call({ to: action.to, data: action.data });
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  anvil = Bun.spawn(
    ["anvil", "--port", String(port), "--chain-id", "1", "--silent"],
    { stdout: "ignore", stderr: "pipe" },
  );
  transport = http(`http://127.0.0.1:${port}`, { retryCount: 0 });
  client = createPublicClient({ transport });
  for (let attempt = 0; ; attempt++) {
    try {
      await client.getChainId();
      break;
    } catch (error) {
      if (attempt > 50) throw error;
      await Bun.sleep(40);
    }
  }
  await installAssertionsCore(client);
  const setCode = (address: Address, code: Hex) =>
    client.request({
      method: "anvil_setCode" as never,
      params: [address, code] as never,
    });
  // STOP: succeeds with no returndata, whatever is called.
  await setCode(PASSES, "0x00");
  // REVERT(0, 0).
  await setCode(REVERTS, "0x60006000fd");
  await installConstantMock(client, SEVEN, numberToHex(7n, { size: 32 }));
});
afterAll(() => anvil?.kill());

describe("@reverts! over a call that returns nothing", () => {
  it("says whether it reverts", async () => {
    expect(await holds(`assert @reverts!(${check(REVERTS)}) == true "m"`)).toBe(
      true,
    );
    expect(await holds(`assert @reverts!(${check(PASSES)}) == true "m"`)).toBe(
      false,
    );
  });

  it("asserts that it still goes through", async () => {
    const goesThrough = (target: Address) =>
      `assert @bool!(not @reverts!(${check(target)})) == true "withdrawal blocked"`;
    expect(await holds(goesThrough(PASSES))).toBe(true);
    expect(await holds(goesThrough(REVERTS))).toBe(false);
  });

  it("takes live arguments, resolved before the call is probed", async () => {
    const live = (target: Address) =>
      `assert @bool!(not @reverts!(${target}::!{check(uint256)() ${SEVEN}::!{n()(uint256)}})) == true "m"`;
    expect(await holds(live(PASSES))).toBe(true);
    expect(await holds(live(REVERTS))).toBe(false);
  });

  it("still refuses a void call anywhere but the end of a chain", async () => {
    await expect(
      compile(
        `assert @reverts!(${PASSES}::!{owner()()}::!{checkWithdrawal(bytes32,address)() ${HASH} ${WHO}}) == true "m"`,
      ),
    ).rejects.toThrow(/no return value/);
  });

  it("is answered the same way off-chain, while the script builds", async () => {
    const answer = async (target: Address) => {
      const logs: string[] = [];
      await new Interpreter(tag.registry, {
        chainId: 1,
        transports: { 1: transport },
        onLog: (m: string) => logs.push(m),
      }).interpret(
        `print @reverts(${target}::{checkWithdrawal(bytes32,address)() ${HASH} ${WHO}})`,
      );
      return logs.join("\n");
    };
    expect(await answer(REVERTS)).toContain("true");
    expect(await answer(PASSES)).toContain("false");
  });
});
