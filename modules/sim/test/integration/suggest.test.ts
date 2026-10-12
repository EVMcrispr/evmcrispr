import { describe, expect, it } from "bun:test";
import {
  type Suggestion,
  suggestionScript,
  suggestionSource,
  truncateAddress,
} from "@evmcrispr/sdk";
import {
  getPublicClient,
  getTransports,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { tokenlistOf } from "@evmcrispr/test-utils/msw/tokenlist";
import { installAssertionsCore } from "@evmcrispr/test-utils/onchain";
import { wellFormed } from "@evmcrispr/test-utils/suggestions";
import { formatUnits, getAddress } from "viem";
import { gnosis } from "viem/chains";
import { server } from "../setup";

const SAFE = getAddress("0x00000000000000000000000000000000005afe01");
const tag = evml.with({
  account: TEST_ACCOUNT_ADDRESS,
  chainId: gnosis.id,
  transports: getTransports(),
});
await installAssertionsCore(getPublicClient());
const script = `exec ${SAFE} "ping()" --value 1e18`;
/** The base units a floor asserts: its sentence says them first. */
const floorOf = (suggestion: Suggestion): bigint => {
  const part = suggestion.sentence.find((p) => p.type === "amount");
  if (part?.type !== "amount") throw new Error("no amount in the sentence");
  return BigInt(part.value);
};

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
    wellFormed(native[0]);
    expect(native[0].line).toMatch(
      /^assert @balance!\(XDAI \$executor\) >= @token:amount\(XDAI \d+\.99\)$/,
    );
    expect(native[0].vars).toEqual([{ name: "executor", value: SAFE }]);
    const floor = floorOf(native[0]);
    expect(floor % 10n ** 18n).toBe(99n * 10n ** 16n);
    expect(native[0].description).toBe(
      `${truncateAddress(SAFE)} keeps at least ${floor / 10n ** 18n}.99 XDAI`,
    );
  }, 120000);

  it("the account that pays gas gets a native floor that leaves room for the fee", async () => {
    const payer = getAddress("0x00000000000000000000000000000000009a7e01");
    await getPublicClient().request({
      method: "anvil_setBalance" as never,
      params: [payer, "0x8ac7230489e80000"] as never, // 10 xDAI
    });
    const before = await getPublicClient().getBalance({ address: payer });
    const result = await tag.script(script).simulate({
      using: "ethereumjs",
      from: payer,
      suggest: true,
    });
    expect(result.error).toBeUndefined();
    const native = result.suggestions!.filter((s) => s.event === "native");
    expect(native).toHaveLength(1);
    wellFormed(native[0]);
    expect(
      native[0].description.startsWith(
        `${truncateAddress(payer)} keeps at least `,
      ),
    ).toBe(true);
    expect(native[0].description).toMatch(
      / keeps at least [\d.]+ XDAI, after up to [\d.]+ XDAI for gas$/,
    );
    expect(native[0].line).toMatch(
      /^assert @balance!\(XDAI \$executor\) >= @token:amount\(XDAI \d+\.\d+\)$/,
    );
    expect(native[0].vars).toEqual([{ name: "executor", value: payer }]);
    // It sent 1 xDAI: the floor sits below what is left by the tolerance on
    // that and by the assumed fee, and the fee is far smaller than the send.
    const floor = floorOf(native[0]);
    // The line says that number, to the last wei.
    expect(native[0].line).toBe(
      `assert @balance!(XDAI $executor) >= @token:amount(XDAI ${formatUnits(floor, 18)})`,
    );
    const left = before - 10n ** 18n;
    expect(floor < left - 10n ** 16n).toBe(true);
    expect(floor > left - 10n ** 16n - 10n ** 17n).toBe(true);
    // And it holds when the same run asserts it.
    const again = await tag
      .script(`${script}\n${suggestionScript(native)}`)
      .simulate({ using: "ethereumjs", from: payer });
    expect(again.error).toBeUndefined();
  }, 120000);

  it("the suggested floor is the number it says: it holds down to exactly that, and not a wei below", async () => {
    // The Safe starts with a few odd wei, so what the run computes is not
    // a round number.
    const client = getPublicClient();
    const before = await client.getBalance({ address: SAFE });
    const odd = 123_456_789n;
    const setBalance = (value: bigint) =>
      client.request({
        method: "anvil_setBalance" as never,
        params: [SAFE, `0x${value.toString(16)}`] as never,
      });
    await setBalance(odd);
    try {
      const receiving = (value: bigint, more = "") =>
        tag.script(`exec ${SAFE} "ping()" --value ${value}${more}`).simulate({
          using: "ethereumjs",
          from: TEST_ACCOUNT_ADDRESS,
          ...(more ? {} : { suggest: { executor: SAFE } }),
        });
      const first = await receiving(10n ** 18n);
      const native = first.suggestions!.filter((s) => s.event === "native");
      // Received 1, and 1% of that may be missing: 0.990000000123456789.
      // The floor is asserted at the precision it is said, rounded down.
      expect(native[0].line).toBe(
        "assert @balance!(XDAI $executor) >= @token:amount(XDAI 0.99)",
      );
      expect(native[0].description).toBe(
        `${truncateAddress(SAFE)} keeps at least 0.99 XDAI`,
      );
      const floor = floorOf(native[0]);
      expect(floor).toBe(99n * 10n ** 16n);
      // A native floor is the only suggestion here, and its amount needs
      // the token module: the script loads it.
      const added = suggestionScript(native);
      expect(added.split("\n")).toEqual([
        "load token",
        `set $executor ${SAFE}`,
        native[0].line,
      ]);
      // It holds for the run it came from; when the Safe ends with exactly
      // the number said; and not with one wei less.
      expect((await receiving(10n ** 18n, `\n${added}`)).error).toBeUndefined();
      expect(
        (await receiving(floor - odd, `\n${added}`)).error,
      ).toBeUndefined();
      expect((await receiving(floor - odd - 1n, `\n${added}`)).success).toBe(
        false,
      );
    } finally {
      await setBalance(before);
    }
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
    // An account with funds of its own, so the run also has a native floor.
    const sender = getAddress("0x00000000000000000000000000000000009a7e02");
    await getPublicClient().request({
      method: "anvil_setBalance" as never,
      params: [sender, "0x8ac7230489e80000"] as never, // 10 xDAI
    });
    const transfer = [
      `exec ${WXDAI} "deposit()" --value 2e18`,
      // Not a round number, so the floor computed is not one either.
      `exec ${WXDAI} "transfer(address,uint256)" ${BOB} 1000000000123456789`,
    ].join("\n");
    const first = await tag.script(transfer).simulate({
      using: "ethereumjs",
      from: sender,
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
    for (const suggestion of first.suggestions!) wellFormed(suggestion);
    // The source a host shows: the token by its own symbol, the event by
    // its name, and no trailing attribution in the sentence.
    expect(token[0].eventName).toBe("Transfer");
    expect(token[0].emitterName).toBe("WXDAI");
    expect(suggestionSource(token[0])).toBe(
      "Suggested by WXDAI (0xe91D...a97d)'s Transfer event",
    );
    // WXDAI is in the chain's token list under that symbol: that names
    // its variable. The lines hold its address, never the symbol, and
    // amounts are in its own units.
    expect(token[0].line).toMatch(
      /^assert @balance!\(\$wxdai \$executor\) >= @token:amount\(\$wxdai \d+(\.\d+)?\)$/,
    );
    expect(token[0].vars).toEqual([
      { name: "wxdai", value: WXDAI },
      { name: "executor", value: sender },
    ]);
    expect(token[1].line).toMatch(
      /^assert @balance!\(\$wxdai \$recipient\) >= @token:amount\(\$wxdai \d+(\.\d+)?\)$/,
    );
    expect(token[1].vars).toEqual([
      { name: "wxdai", value: WXDAI },
      { name: "recipient", value: BOB },
    ]);
    expect(token[0].sentence[0]).toEqual({
      type: "address",
      address: sender,
    });
    expect(token[0].sentence.at(-1)).toMatchObject({
      type: "amount",
      token: WXDAI,
      symbol: "WXDAI",
      decimals: 18,
      // The list gives the token that very symbol.
      listed: true,
    });
    const me = truncateAddress(sender);
    expect(token[0].description).toMatch(
      /^\S+ keeps at least [\d,.]+ WXDAI \(0xe91D\.\.\.a97d\)$/,
    );
    expect(token[0].description.startsWith(`${me} keeps`)).toBe(true);
    expect(token[1].description).toMatch(
      /^\S+ holds at least [\d,.]+ WXDAI \(0xe91D\.\.\.a97d\); that account can make this check fail by moving its funds first$/,
    );
    expect(
      token[1].description.startsWith(`${truncateAddress(BOB)} holds`),
    ).toBe(true);
    // The executor is one variable in every line of the run, the native
    // floor included.
    const native = first.suggestions!.find((s) => s.event === "native")!;
    expect(native.vars).toEqual([{ name: "executor", value: sender }]);
    // Every suggestion of the run, added to it as one script, holds: its
    // loads, each variable once, then the lines.
    const added = suggestionScript(first.suggestions!);
    expect(added.split("\n").filter((l) => l.startsWith("set "))).toEqual([
      `set $wxdai ${WXDAI}`,
      `set $executor ${sender}`,
      `set $recipient ${BOB}`,
    ]);
    const second = await tag
      .script(`${transfer}\n${added}`)
      .simulate({ using: "ethereumjs", from: sender });
    expect(second.error).toBeUndefined();
    // Left with 0.999999999876543211 and 1% of what was sent may be
    // missing: 0.989999999875308643. The floor is asserted at the
    // precision it is said, rounded down (the nearest would say 0.99, which
    // is more than was computed).
    const floor = floorOf(token[0]);
    expect(floor).toBe(9_899n * 10n ** 14n);
    expect(token[0].line).toBe(
      "assert @balance!($wxdai $executor) >= @token:amount($wxdai 0.9899)",
    );
    expect(token[0].sentence.at(-1)).toMatchObject({
      value: "989900000000000000",
      bound: "floor",
      text: "0.9899 WXDAI",
    });
    // The same line holds when the sender is left with exactly the number
    // said, and not with one base unit less.
    const leaving = (left: bigint) =>
      tag
        .script(
          [
            `exec ${WXDAI} "deposit()" --value 2e18`,
            `exec ${WXDAI} "transfer(address,uint256)" ${BOB} ${2n * 10n ** 18n - left}`,
            suggestionScript([token[0]]),
          ].join("\n"),
        )
        .simulate({ using: "ethereumjs", from: sender });
    expect((await leaving(floor)).error).toBeUndefined();
    expect((await leaving(floor - 1n)).success).toBe(false);

    // A script is compiled again every time it runs, with whatever the
    // token list says then. A symbol written in a line follows the list:
    const bySymbol = () =>
      tag
        .script(`${transfer}\nassert @balance!(WXDAI ${sender}) >= 1`)
        .simulate({ using: "ethereumjs", from: sender });
    expect((await bySymbol()).error).toBeUndefined();
    const elsewhere = getAddress("0x00000000000000000000000000000000000e15e0");
    for (const later of [
      // The list now gives the symbol to another address; or has no tokens.
      [{ symbol: "WXDAI", chainId: gnosis.id, address: elsewhere }],
      [],
    ]) {
      server.use(tokenlistOf(later));
      try {
        expect((await bySymbol()).success).toBe(false);
        // The suggested lines hold the address they were confirmed on:
        // they still hold, and still read that token to the base unit.
        const again = await tag
          .script(`${transfer}\n${added}`)
          .simulate({ using: "ethereumjs", from: sender });
        expect(again.error).toBeUndefined();
        expect((await leaving(floor)).error).toBeUndefined();
        expect((await leaving(floor - 1n)).success).toBe(false);
      } finally {
        server.resetHandlers();
      }
    }
  }, 180000);

  it("an address in two roles is named by whether it has code, and a dust line says its unit and still runs", async () => {
    const WXDAI = getAddress("0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d");
    const BOB = getAddress("0x0000000000000000000000000000000000000b0b");
    const VAULT = getAddress("0x0000000000000000000000000000000000c0de01");
    const sender = getAddress("0x00000000000000000000000000000000009a7e03");
    const client = getPublicClient();
    await client.request({
      method: "anvil_setBalance" as never,
      params: [sender, "0x8ac7230489e80000"] as never,
    });
    await client.request({
      method: "anvil_setCode" as never,
      params: [VAULT, "0x00"] as never,
    });
    try {
      // Each of the two receives and may spend: a recipient and a spender.
      const moves = [
        `exec ${WXDAI} "deposit()" --value 2e18`,
        ...[BOB, VAULT].flatMap((to) => [
          `exec ${WXDAI} "transfer(address,uint256)" ${to} 5e17`,
          `exec ${WXDAI} "approve(address,uint256)" ${to} 5`,
        ]),
      ].join("\n");
      const first = await tag.script(moves).simulate({
        using: "ethereumjs",
        from: sender,
        suggest: true,
      });
      expect(first.error).toBeUndefined();
      for (const suggestion of first.suggestions!) wellFormed(suggestion);
      const lines = first.suggestions!.map((s) => s.line);
      expect(lines.filter((l) => l.includes("allowance"))).toEqual([
        "assert @token:allowance!($wxdai $executor $account) == 5  # base units of $wxdai",
        "assert @token:allowance!($wxdai $executor $contract) == 5  # base units of $wxdai",
      ]);
      expect(lines).toContain(
        "assert @balance!($wxdai $account) >= @token:amount($wxdai 0.495)",
      );
      expect(lines).toContain(
        "assert @balance!($wxdai $contract) >= @token:amount($wxdai 0.495)",
      );
      const added = suggestionScript(first.suggestions!);
      expect(added.split("\n")).toContain(`set $account ${BOB}`);
      expect(added.split("\n")).toContain(`set $contract ${VAULT}`);
      // The lines, comments and all, are a script: nothing to report, and
      // they hold when the same run asserts them.
      const whole = `${moves}\n${added}`;
      expect((await tag.script(whole).validate()).diagnostics).toEqual([]);
      const second = await tag
        .script(whole)
        .simulate({ using: "ethereumjs", from: sender });
      expect(second.error).toBeUndefined();
      // The comment changes nothing of what is asserted: one base unit off
      // and the line fails.
      const off = await tag
        .script(whole.replace("$account) == 5 ", "$account) == 4 "))
        .simulate({ using: "ethereumjs", from: sender });
      expect(off.success).toBe(false);
    } finally {
      await client.request({
        method: "anvil_setCode" as never,
        params: [VAULT, "0x"] as never,
      });
    }
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
