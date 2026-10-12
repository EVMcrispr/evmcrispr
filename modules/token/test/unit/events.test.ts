import "../setup";
import { describe, expect, it } from "bun:test";
import { suggestionScript, type TokenInfo } from "@evmcrispr/sdk";
import { evml } from "@evmcrispr/test-utils/evml";
import {
  EXECUTOR,
  eventLog,
  literalLine,
  suggestEnv,
  suggested,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { getAddress } from "viem";
import { events } from "../../src/_generated";

const TOKEN = getAddress("0x00000000000000000000000000000000000700e1");
const NFT = getAddress("0x00000000000000000000000000000000000700e2");
const BOB = getAddress("0x0000000000000000000000000000000000000b0b");
const SPENDER = getAddress("0x00000000000000000000000000000000000005be");
const ERC20_TRANSFER =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const ERC721_TRANSFER =
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)";
const ERC20_APPROVAL =
  "event Approval(address indexed owner, address indexed spender, uint256 value)";

const run = (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  suggested({
    modules: [{ name: "token", events }],
    logs,
    env: suggestEnv(answers),
  });

describe("token events", () => {
  it("nets the executor's transfers of a token into one floor, and a floor for who received", async () => {
    const out = await run(
      [
        eventLog(ERC20_TRANSFER, TOKEN, {
          from: EXECUTOR,
          to: BOB,
          value: 70n,
        }),
        eventLog(ERC20_TRANSFER, TOKEN, {
          from: EXECUTOR,
          to: BOB,
          value: 30n,
        }),
      ],
      {
        [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 900n,
        [viewKey(TOKEN, "balanceOf", BOB)]: 100n,
      },
    );
    expect(out.map(literalLine)).toEqual([
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 899  # base units of ${TOKEN}`,
      `assert @balance!(${TOKEN} ${BOB}) >= 99  # base units of ${TOKEN}`,
    ]);
    expect(out.every((s) => s.kind === "amount")).toBe(true);
    // Someone else's balance: they can move it first and make this fail.
    expect(out[0].description).not.toContain("can make this check fail");
    expect(out[1].description).toContain("can make this check fail");
  });

  it("asks for no decrease of a token that moved between others", async () => {
    const out = await run(
      [eventLog(ERC20_TRANSFER, TOKEN, { from: BOB, to: SPENDER, value: 5n })],
      {
        [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 40n,
        [viewKey(TOKEN, "balanceOf", SPENDER)]: 5n,
      },
    );
    expect(out.map(literalLine)).toContain(
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 40  # base units of ${TOKEN}`,
    );
  });

  it("suggests nothing for a token whose balanceOf does not answer", async () => {
    const out = await run(
      [
        eventLog(ERC20_TRANSFER, TOKEN, {
          from: EXECUTOR,
          to: BOB,
          value: 70n,
        }),
      ],
      {},
    );
    expect(out).toEqual([]);
  });

  it("an ERC-721 transfer is an ownership check, not a balance", async () => {
    const out = await run(
      [
        eventLog(ERC721_TRANSFER, NFT, {
          from: EXECUTOR,
          to: BOB,
          tokenId: 7n,
        }),
      ],
      { [viewKey(NFT, "ownerOf", 7n)]: BOB },
    );
    expect(out.map(literalLine)).toEqual([
      `assert ${NFT}::!{ownerOf(uint256)(address) 7} == ${BOB}`,
    ]);
    expect(out[0].event).toBe("erc721Transfer");
  });

  it("an allowance is asserted at its value after the run", async () => {
    const out = await run(
      [
        eventLog(ERC20_APPROVAL, TOKEN, {
          owner: EXECUTOR,
          spender: SPENDER,
          value: 500n,
        }),
      ],
      { [viewKey(TOKEN, "allowance", EXECUTOR, SPENDER)]: 0n },
    );
    expect(out.map(literalLine)).toEqual([
      `assert @token:allowance!(${TOKEN} ${EXECUTOR} ${SPENDER}) == 0`,
    ]);
  });

  it("ApprovalForAll is confirmed by isApprovedForAll", async () => {
    const sig =
      "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)";
    const log = eventLog(sig, NFT, {
      owner: EXECUTOR,
      operator: SPENDER,
      approved: true,
    });
    const line = `assert ${NFT}::!{isApprovedForAll(address,address)(bool) ${EXECUTOR} ${SPENDER}} == true`;
    expect(
      (
        await run([log], {
          [viewKey(NFT, "isApprovedForAll", EXECUTOR, SPENDER)]: true,
        })
      ).map(literalLine),
    ).toEqual([line]);
    expect(
      await run([log], {
        [viewKey(NFT, "isApprovedForAll", EXECUTOR, SPENDER)]: false,
      }),
    ).toEqual([]);
  });

  it("ERC-1155 transfers are balance floors per id", async () => {
    const sig =
      "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)";
    const out = await run(
      [
        eventLog(sig, NFT, {
          operator: EXECUTOR,
          from: EXECUTOR,
          to: BOB,
          id: 3n,
          value: 10n,
        }),
      ],
      {
        [viewKey(NFT, "balanceOf", EXECUTOR, 3n)]: 90n,
        [viewKey(NFT, "balanceOf", BOB, 3n)]: 10n,
      },
    );
    expect(out.map(literalLine)).toEqual([
      `assert ${NFT}::!{balanceOf(address,uint256)(uint256) ${EXECUTOR} 3} >= 89`,
      `assert ${NFT}::!{balanceOf(address,uint256)(uint256) ${BOB} 3} >= 9`,
    ]);
  });

  it("an ERC-1155 batch is one floor per id", async () => {
    const sig =
      "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)";
    const out = await run(
      [
        eventLog(sig, NFT, {
          operator: EXECUTOR,
          from: EXECUTOR,
          to: BOB,
          ids: [3n, 4n],
          values: [10n, 20n],
        }),
      ],
      {
        [viewKey(NFT, "balanceOf", EXECUTOR, 3n)]: 90n,
        [viewKey(NFT, "balanceOf", EXECUTOR, 4n)]: 80n,
      },
    );
    expect(out.map(literalLine)).toEqual([
      `assert ${NFT}::!{balanceOf(address,uint256)(uint256) ${EXECUTOR} 3} >= 89`,
      `assert ${NFT}::!{balanceOf(address,uint256)(uint256) ${EXECUTOR} 4} >= 79`,
    ]);
  });

  it("an ERC-721 approval names who may move the token", async () => {
    const sig =
      "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)";
    const out = await run(
      [eventLog(sig, NFT, { owner: EXECUTOR, approved: SPENDER, tokenId: 7n })],
      {
        [viewKey(NFT, "getApproved", 7n)]: SPENDER,
      },
    );
    expect(out.map(literalLine)).toEqual([
      `assert ${NFT}::!{getApproved(uint256)(address) 7} == ${SPENDER}`,
    ]);
    expect(out[0].event).toBe("erc721Approval");
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events)) {
      expect(source, name).toContain(entry.event);
    }
  });

  it("a balance that contradicts the transfer suggests nothing for that account", async () => {
    // BOB is said to have received 70 and holds 0: the event is not confirmed.
    const out = await run(
      [
        eventLog(ERC20_TRANSFER, TOKEN, {
          from: EXECUTOR,
          to: BOB,
          value: 70n,
        }),
      ],
      {
        [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 900n,
        [viewKey(TOKEN, "balanceOf", BOB)]: 0n,
      },
    );
    expect(out.map(literalLine)).toEqual([
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 899  # base units of ${TOKEN}`,
    ]);
  });

  it("a floor of zero asserts nothing and is not suggested", async () => {
    const out = await run(
      [eventLog(ERC20_TRANSFER, TOKEN, { from: BOB, to: SPENDER, value: 5n })],
      {
        [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 0n,
        [viewKey(TOKEN, "balanceOf", SPENDER)]: 5n,
      },
    );
    expect(out.map(literalLine)).toEqual([
      `assert @balance!(${TOKEN} ${SPENDER}) >= 4  # base units of ${TOKEN}`,
    ]);
  });

  it("the executor's own gain is not described as someone else's balance", async () => {
    const out = await run(
      [
        eventLog(ERC20_TRANSFER, TOKEN, {
          from: BOB,
          to: EXECUTOR,
          value: 100n,
        }),
      ],
      { [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 100n },
    );
    expect(out.map(literalLine)).toEqual([
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 99  # base units of ${TOKEN}`,
    ]);
    expect(out[0].description).not.toContain("can make this check fail");
  });
});

describe("token suggestions, as a host reads them", () => {
  const known = (
    info: TokenInfo,
    logs: ReturnType<typeof eventLog>[],
    answers: Record<string, unknown>,
  ) =>
    suggested({
      modules: [{ name: "token", events }],
      logs,
      env: suggestEnv(answers, {
        token: async () => info,
        emitterName: async () => info.symbol,
      }),
    });
  const sent = [
    eventLog(ERC20_TRANSFER, TOKEN, {
      from: EXECUTOR,
      to: BOB,
      value: 1_000_000_000n,
    }),
  ];
  const balances = {
    [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 51_960_298_220n,
    [viewKey(TOKEN, "balanceOf", BOB)]: 1_000_000_000n,
  };

  it("a token in the chain's list is a variable named by the list, and its amounts are in its units", async () => {
    const out = await known(
      { symbol: "USDC", decimals: 6, listed: "USDC" },
      sent,
      balances,
    );
    expect(out.map((s) => [s.line, s.vars])).toEqual([
      [
        // 51,960.29822 less 1% of the 1,000 sent is 51,950.29822: the
        // floor is asserted at the precision it is said, rounded down.
        "assert @balance!($usdc $executor) >= @token:amount($usdc 51950.2982)",
        [
          { name: "usdc", value: TOKEN },
          { name: "executor", value: EXECUTOR },
        ],
      ],
      [
        "assert @balance!($usdc $recipient) >= @token:amount($usdc 990)",
        [
          { name: "usdc", value: TOKEN },
          { name: "recipient", value: BOB },
        ],
      ],
    ]);
    expect(out[0].sentence).toEqual([
      { type: "address", address: EXECUTOR },
      { type: "text", text: " keeps at least " },
      {
        type: "amount",
        value: "51950298200",
        bound: "floor",
        token: TOKEN,
        symbol: "USDC",
        decimals: 6,
        listed: true,
        text: "51,950.2982 USDC",
      },
    ]);
    expect(out.map((s) => s.description)).toEqual([
      "0x0000...0ec0 keeps at least 51,950.2982 USDC (0x0000...00e1)",
      "0x0000...0B0b holds at least 990 USDC (0x0000...00e1); that account can make this check fail by moving its funds first",
    ]);
  });

  it("one that only calls itself USDC is $token: its own word names nothing", async () => {
    const out = await known({ symbol: "USDC", decimals: 6 }, sent, balances);
    expect(out.map((s) => s.line)).toEqual([
      "assert @balance!($token $executor) >= @token:amount($token 51950.2982)",
      "assert @balance!($token $recipient) >= @token:amount($token 990)",
    ]);
    expect(out[0].vars).toEqual([
      { name: "token", value: TOKEN },
      { name: "executor", value: EXECUTOR },
    ]);
    // The sentence still shows the name, beside the address, unvouched.
    expect(out[0].description).toBe(
      "0x0000...0ec0 keeps at least 51,950.2982 USDC (0x0000...00e1)",
    );
    expect(out[0].sentence.at(-1)).not.toHaveProperty("listed");
    // What is asserted is the same number either way.
    expect(literalLine(out[0])).toBe(
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= @token:amount(${TOKEN} 51950.2982)`,
    );
  });

  it("an executor that received holds at least what it has", async () => {
    const out = await known(
      { symbol: "USDC", decimals: 6 },
      [
        eventLog(ERC20_TRANSFER, TOKEN, {
          from: BOB,
          to: EXECUTOR,
          value: 100_000_000n,
        }),
      ],
      { [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 100_000_000n },
    );
    expect(out.map((s) => s.description)).toEqual([
      "0x0000...0ec0 holds at least 99 USDC (0x0000...00e1)",
    ]);
  });

  it("an allowance says how much is left, from whom, and when nothing is", async () => {
    const approval = [
      eventLog(ERC20_APPROVAL, TOKEN, {
        owner: EXECUTOR,
        spender: SPENDER,
        value: 500n,
      }),
    ];
    const left = (allowance: bigint) =>
      known({ symbol: "USDC", decimals: 6 }, approval, {
        [viewKey(TOKEN, "allowance", EXECUTOR, SPENDER)]: allowance,
      });
    const [some] = await left(12_500_000n);
    expect(some.line).toBe(
      "assert @token:allowance!($token $executor $spender) == @token:amount($token 12.5)",
    );
    expect(some.description).toBe(
      "0x0000...05BE is left with an allowance of 12.5 USDC (0x0000...00e1) from 0x0000...0ec0",
    );
    const [none] = await left(0n);
    expect(none.line).toBe(
      "assert @token:allowance!($token $executor $spender) == 0",
    );
    expect(none.description).toBe(
      "0x0000...05BE is left with no USDC (0x0000...00e1) allowance from 0x0000...0ec0",
    );
    expect(none.sentence).toContainEqual({
      type: "address",
      address: TOKEN,
      name: "USDC",
    });
  });

  it("a floor is said and asserted rounded down, and an allowance in full", async () => {
    const [floor] = await known(
      { symbol: "USDC", decimals: 6 },
      [eventLog(ERC20_TRANSFER, TOKEN, { from: BOB, to: SPENDER, value: 5n })],
      { [viewKey(TOKEN, "balanceOf", EXECUTOR)]: 899_999_960n },
    );
    expect(floor.line).toBe(
      "assert @balance!($token $executor) >= @token:amount($token 899.9999)",
    );
    expect(floor.description).toBe(
      "0x0000...0ec0 keeps at least 899.9999 USDC (0x0000...00e1)",
    );
    const [left] = await known(
      { symbol: "USDC", decimals: 6 },
      [
        eventLog(ERC20_APPROVAL, TOKEN, {
          owner: EXECUTOR,
          spender: SPENDER,
          value: 1n,
        }),
      ],
      { [viewKey(TOKEN, "allowance", EXECUTOR, SPENDER)]: 899_999_960n },
    );
    expect(left.description).toBe(
      "0x0000...05BE is left with an allowance of 899.99996 USDC (0x0000...00e1) from 0x0000...0ec0",
    );
    // An equality keeps every digit, in the line as in the sentence.
    expect(left.line).toBe(
      "assert @token:allowance!($token $executor $spender) == @token:amount($token 899.99996)",
    );
    expect(left.sentence.find((p) => p.type === "amount")).toMatchObject({
      value: "899999960",
      bound: "exact",
    });
    expect(floor.sentence.find((p) => p.type === "amount")).toMatchObject({
      value: "899999900",
      bound: "floor",
      text: "899.9999 USDC",
    });
  });

  it("the largest allowance there is reads as unlimited, and its line keeps the number", async () => {
    const max = 2n ** 256n - 1n;
    const left = async (allowance: bigint) =>
      (
        await known(
          { symbol: "USDC", decimals: 6 },
          [
            eventLog(ERC20_APPROVAL, TOKEN, {
              owner: EXECUTOR,
              spender: SPENDER,
              value: 1n,
            }),
          ],
          { [viewKey(TOKEN, "allowance", EXECUTOR, SPENDER)]: allowance },
        )
      )[0];
    const unlimited = await left(max);
    expect(unlimited.description).toBe(
      "0x0000...05BE is left with an unlimited allowance of USDC (0x0000...00e1) from 0x0000...0ec0",
    );
    expect(unlimited.line).toBe(
      "assert @token:allowance!($token $executor $spender) == @token:amount($token 115792089237316195423570985008687907853269984665640564039457584007913129.639935)",
    );
    // One less is a number like any other.
    expect((await left(max - 1n)).description).toContain(
      "an allowance of 115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,457,584,007,913,129.639934 USDC",
    );
  });
});

describe("a line in base units", () => {
  it("says so in a comment the editor reads as one: no diagnostic, and it hovers as any comment does", async () => {
    const out = await run(
      [
        eventLog(ERC20_APPROVAL, TOKEN, {
          owner: EXECUTOR,
          spender: SPENDER,
          value: 5n,
        }),
      ],
      { [viewKey(TOKEN, "allowance", EXECUTOR, SPENDER)]: 5n },
    );
    expect(out.map((s) => s.line)).toEqual([
      "assert @token:allowance!($token $executor $spender) == 5  # base units of $token",
    ]);
    const script = suggestionScript(out);
    const lines = script.split("\n");
    const workspace = evml.workspace();
    expect(await workspace.getFullDiagnostics(script)).toEqual([]);
    expect((await evml.script(script).validate()).diagnostics).toEqual([]);
    const at = (col: number) =>
      workspace.getHoverInfo(script, { line: lines.length, col });
    const last = lines.at(-1)!;
    // The words of the comment are nothing; its variable hovers as the
    // variable it is, as in any comment.
    expect(await at(last.indexOf("#") + 3)).toBeNull();
    expect(await at(last.lastIndexOf("$token") + 2)).toEqual(
      await at(last.indexOf("$token") + 2),
    );
    // In the line: the helper, as without the comment.
    expect((await at(last.indexOf("allowance")))?.contents.join()).toContain(
      "@token:allowance!",
    );
  });
});
