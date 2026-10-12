import "../setup";
import { describe, expect, it } from "bun:test";
import {
  getPublicClient,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { installAssertionsCore } from "@evmcrispr/test-utils/onchain";
import { getAddress } from "viem";
import { gnosis } from "viem/chains";

const SAFE = getAddress("0x00000000000000000000000000000000005afe01");
const tag = evml.with({
  account: TEST_ACCOUNT_ADDRESS,
  chainId: gnosis.id,
  transports: getTransports(),
});
await installAssertionsCore(getPublicClient());
const script = `exec ${SAFE} "ping()" --value 1e18`;

describe("Sim > suggested assertions", () => {
  it("suggests a native floor for an executor that does not pay gas", async () => {
    const result = await tag.script(script).simulate({
      using: "ethereumjs",
      from: TEST_ACCOUNT_ADDRESS,
      suggest: { executor: SAFE },
    });
    expect(result.error).toBeUndefined();
    const native = result.suggestions!.filter((s) => s.event === "native");
    expect(native).toHaveLength(1);
    expect(native[0].module).toBe("std");
    expect(native[0].kind).toBe("amount");
    // Received 1e18; 1% of the gain may be missing.
    expect(native[0].line).toMatch(
      new RegExp(`^assert @balance!\\(XDAI ${SAFE}\\) >= \\d+$`),
    );
    const floor = BigInt(native[0].line.split(">= ")[1]);
    expect(floor % 10n ** 18n).toBe(99n * 10n ** 16n);
  }, 120000);

  it("suggests no native floor for the account that pays gas", async () => {
    const result = await tag.script(script).simulate({
      using: "ethereumjs",
      from: TEST_ACCOUNT_ADDRESS,
      suggest: true,
    });
    expect(result.suggestions!.filter((s) => s.event === "native")).toEqual([]);
  }, 120000);

  it("the suggested line holds when added to the script", async () => {
    const first = await tag.script(script).simulate({
      using: "ethereumjs",
      from: TEST_ACCOUNT_ADDRESS,
      suggest: { executor: SAFE },
    });
    const line = first.suggestions!.find((s) => s.event === "native")!.line;
    const second = await tag
      .script(`${script}\n${line}`)
      .simulate({ using: "ethereumjs", from: TEST_ACCOUNT_ADDRESS });
    expect(second.error).toBeUndefined();
  }, 120000);

  it("still suggests for the starting chain when the script ends on another one", async () => {
    // The fork returns to its starting chain when its block ends, so the
    // run can be read back there.
    const result = await tag.script(`${script}\nswitch mainnet`).simulate({
      using: "ethereumjs",
      from: TEST_ACCOUNT_ADDRESS,
      suggest: { executor: SAFE },
    });
    expect(result.error).toBeUndefined();
    expect(
      result.suggestions!.filter((s) => s.event === "native"),
    ).toHaveLength(1);
  }, 120000);

  it("returns none when the run fails", async () => {
    const result = await tag
      .script(`exec ${SAFE} "nope()"\nassert @balance!(XDAI ${SAFE}) >= 1e30`)
      .simulate({
        using: "ethereumjs",
        from: TEST_ACCOUNT_ADDRESS,
        suggest: true,
      });
    expect(result.success).toBe(false);
    expect(result.suggestions).toBeUndefined();
  }, 120000);
  it("a real transfer on the fork yields floors that hold when added", async () => {
    const WXDAI = getAddress("0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d");
    const BOB = getAddress("0x0000000000000000000000000000000000000b0b");
    const transfer = [
      `exec ${WXDAI} "deposit()" --value 2e18`,
      `exec ${WXDAI} "transfer(address,uint256)" ${BOB} 1e18`,
    ].join("\n");
    const first = await tag.script(transfer).simulate({
      using: "ethereumjs",
      from: TEST_ACCOUNT_ADDRESS,
      suggest: true,
    });
    expect(first.error).toBeUndefined();
    const token = first.suggestions!.filter(
      (s) => s.module === "token" && s.emitter === WXDAI,
    );
    expect(token.map((s) => s.event)).toEqual([
      "erc20Transfer",
      "erc20Transfer",
    ]);
    expect(
      token[0].line.startsWith(
        `assert @balance!(${WXDAI} ${getAddress(TEST_ACCOUNT_ADDRESS)}) >= `,
      ),
    ).toBe(true);
    expect(
      token[1].line.startsWith(`assert @balance!(${WXDAI} ${BOB}) >= `),
    ).toBe(true);
    const second = await tag
      .script(`load token\n${transfer}\n${token.map((s) => s.line).join("\n")}`)
      .simulate({ using: "ethereumjs", from: TEST_ACCOUNT_ADDRESS });
    expect(second.error).toBeUndefined();
  }, 180000);

  it("a simulation with no account still runs when suggestions are off", async () => {
    const accountless = evml.with({
      chainId: gnosis.id,
      transports: getTransports(),
    });
    const result = await accountless
      .script("print hi")
      .simulate({ using: "ethereumjs" });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  }, 120000);

  it("and with them on, it reports none instead of failing", async () => {
    const accountless = evml.with({
      chainId: gnosis.id,
      transports: getTransports(),
    });
    const result = await accountless
      .script("print hi")
      .simulate({ using: "ethereumjs", suggest: true });
    expect(result.error).toBeUndefined();
    expect(result.suggestions).toEqual([]);
  }, 120000);
});
