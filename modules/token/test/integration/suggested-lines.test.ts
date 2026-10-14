import "../setup";
import { expect, test } from "bun:test";
import { suggestionScript } from "@evmcrispr/sdk";
import {
  EXECUTOR,
  eventLog,
  mockedEnv,
  scriptHolds,
  suggested,
  suggestionsHold,
} from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress } from "viem";
import { events } from "../../src/_generated";

const TOKEN = getAddress("0x00000000000000000000000000000000000700e1");
const NFT = getAddress("0x00000000000000000000000000000000000700e2");
const PLAIN = getAddress("0x00000000000000000000000000000000000700e3");
const DUSTY = getAddress("0x00000000000000000000000000000000000700e4");
const BOB = getAddress("0x0000000000000000000000000000000000000b0b");
const SPENDER = getAddress("0x00000000000000000000000000000000000005be");
const OPERATOR = getAddress("0x0000000000000000000000000000000000000be7");
const HOLDER = getAddress("0x0000000000000000000000000000000000000de7");
const word = (type: string, value: unknown) =>
  encodeAbiParameters([{ type }], [value as never]);
const TRANSFER =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const transfer = (token: `0x${string}`, value: bigint) =>
  eventLog(TRANSFER, token, { from: EXECUTOR, to: BOB, value });
// A token that says what it is: amounts are written in its own units.
const erc20 = {
  "balanceOf(address)": word("uint256", 900_000_001n),
  "allowance(address,address)": word("uint256", 500_500_000n),
  "symbol()": word("string", "USDC"),
  "decimals()": word("uint8", 6),
};
const nft = {
  "balanceOf(address,uint256)": word("uint256", 900n),
  "ownerOf(uint256)": word("address", HOLDER),
  "getApproved(uint256)": word("address", OPERATOR),
  "isApprovedForAll(address,address)": word("bool", true),
};

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what token events suggest runs as a script and holds against the views read", async () => {
  const out = await suggestionsHold(
    "token",
    events,
    [
      transfer(TOKEN, 100_000_000n),
      eventLog(
        "event Approval(address indexed owner, address indexed spender, uint256 value)",
        TOKEN,
        { owner: EXECUTOR, spender: SPENDER, value: 1n },
      ),
      eventLog(
        "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
        NFT,
        { operator: EXECUTOR, from: EXECUTOR, to: BOB, id: 3n, value: 10n },
      ),
      eventLog(
        "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
        NFT,
        {
          operator: EXECUTOR,
          from: EXECUTOR,
          to: BOB,
          ids: [4n],
          values: [10n],
        },
      ),
      eventLog(
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        NFT,
        { from: EXECUTOR, to: HOLDER, tokenId: 7n },
      ),
      eventLog(
        "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
        NFT,
        { owner: HOLDER, approved: OPERATOR, tokenId: 7n },
      ),
      eventLog(
        "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
        NFT,
        { owner: EXECUTOR, operator: OPERATOR, approved: true },
      ),
    ],
    { [TOKEN]: erc20, [NFT]: nft },
    // The chain's token list resolves USDC to this token: that, and not
    // what the token calls itself, names its variable.
    {
      token: async () => ({ symbol: "USDC", decimals: 6, listed: "USDC" }),
    },
  );
  expect(new Set(out.map((s) => s.event))).toEqual(
    new Set(Object.keys(events)),
  );
  expect(shown(out)).toMatchInlineSnapshot(`
    "approvalForAll
      assert $token::!{isApprovedForAll(address,address)(bool) $executor $account} == true
      0x0000...0bE7 may move every token of 0x0000...0ec0 in 0x0000...00e2
    erc1155TransferBatch
      assert $token::!{balanceOf(address,uint256)(uint256) $executor 4} >= 899
      0x0000...0ec0 keeps at least 899 of token #4 in 0x0000...00e2
    erc1155TransferBatch
      assert $token::!{balanceOf(address,uint256)(uint256) $recipient 4} >= 899
      0x0000...0B0b holds at least 899 of token #4 in 0x0000...00e2
    erc1155TransferSingle
      assert $token::!{balanceOf(address,uint256)(uint256) $executor 3} >= 899
      0x0000...0ec0 keeps at least 899 of token #3 in 0x0000...00e2
    erc1155TransferSingle
      assert $token::!{balanceOf(address,uint256)(uint256) $recipient 3} >= 899
      0x0000...0B0b holds at least 899 of token #3 in 0x0000...00e2
    erc20Approval
      assert @token:allowance!($usdc $executor $spender) == @token:amount($usdc 500.5)
      0x0000...05BE is left with an allowance of 500.5 USDC (0x0000...00e1) from 0x0000...0ec0
    erc20Transfer
      assert @balance!($usdc $executor) >= @token:amount($usdc 899)
      0x0000...0ec0 keeps at least 899 USDC (0x0000...00e1)
    erc20Transfer
      assert @balance!($usdc $recipient) >= @token:amount($usdc 899)
      0x0000...0B0b holds at least 899 USDC (0x0000...00e1)
    erc721Approval
      assert $token::!{getApproved(uint256)(address) 7} == $account
      Token #7 in 0x0000...00e2 may be moved by 0x0000...0bE7
    erc721Transfer
      assert $token::!{ownerOf(uint256)(address) 7} == $owner
      Token #7 in 0x0000...00e2 is owned by 0x0000...0de7"
  `);
}, 180000);

test("floors hold at the precision they are said, with and without decimals", async () => {
  // 18 decimals and a balance with every digit used, in a token that
  // calls itself USDC and that no list vouches for; no decimals at all,
  // under a name that is not one; a token that does not say: its floor
  // stays in base units; and dust of an 18-decimal token, which is said in
  // base units and so written in them.
  const out = await suggestionsHold(
    "token",
    events,
    [
      transfer(TOKEN, 100n),
      transfer(NFT, 100n),
      transfer(PLAIN, 100n),
      transfer(DUSTY, 100n),
    ],
    {
      [TOKEN]: {
        "balanceOf(address)": word("uint256", 1_234_567_890_123_456_789n),
        "decimals()": word("uint8", 18),
        "symbol()": word("string", "USDC"),
      },
      [NFT]: {
        "balanceOf(address)": word("uint256", 900n),
        "decimals()": word("uint8", 0),
        "symbol()": word("string", "USDC (verified)"),
      },
      [PLAIN]: { "balanceOf(address)": word("uint256", 5n) },
      [DUSTY]: {
        "balanceOf(address)": word("uint256", 999_999_999_999n),
        "decimals()": word("uint8", 18),
        "symbol()": word("string", "WETH"),
      },
    },
  );
  expect(shown(out)).toMatchInlineSnapshot(`
    "erc20Transfer
      assert @balance!($token $executor) >= @token:amount($token 1.2345)
      0x0000...0ec0 keeps at least 1.2345 USDC (0x0000...00e1)
    erc20Transfer
      assert @balance!($token $recipient) >= @token:amount($token 1.2345)
      0x0000...0B0b holds at least 1.2345 USDC (0x0000...00e1)
    erc20Transfer
      assert @balance!($token2 $executor) >= @token:amount($token2 899)
      0x0000...0ec0 keeps at least 899 of 0x0000...00e2
    erc20Transfer
      assert @balance!($token2 $recipient) >= @token:amount($token2 899)
      0x0000...0B0b holds at least 899 of 0x0000...00e2
    erc20Transfer
      assert @balance!($token3 $executor) >= 4  # base units of $token3
      0x0000...0ec0 keeps at least 4 base units of 0x0000...00e3
    erc20Transfer
      assert @balance!($token4 $executor) >= 999999999998  # base units of $token4
      0x0000...0ec0 keeps at least 999999999998 base units of WETH (0x0000...00e4)
    erc20Transfer
      assert @balance!($token4 $recipient) >= 999999999998  # base units of $token4
      0x0000...0B0b holds at least 999999999998 base units of WETH (0x0000...00e4)"
  `);
  // The base units asserted for the executor: the balance, less the one
  // unit of tolerance on what moved, rounded down to what is said
  // (1.234567890123456788 is said, and asserted, as 1.2345).
  const floors = out
    .filter((s) => s.vars.some((v) => v.name === "executor"))
    .map((s) => s.sentence.find((p) => p.type === "amount"))
    .map((p) => (p?.type === "amount" ? p.value : undefined));
  expect(floors).toEqual(["1234500000000000000", "899", "4", "999999999998"]);
}, 180000);

const suggestedTransfer = () =>
  suggested({
    modules: [{ name: "token", events }],
    logs: [transfer(TOKEN, 100_000_000n)],
    env: mockedEnv({ [TOKEN]: erc20 }),
  });

test("a line that reads another view than the contract answers does not hold", async () => {
  const out = await suggestedTransfer();
  expect(out).toHaveLength(2);
  await expect(
    scriptHolds(suggestionScript(out), {
      [TOKEN]: {
        "allowance(address,address)": erc20["balanceOf(address)"],
        "decimals()": erc20["decimals()"],
      },
    }),
  ).rejects.toThrow();
}, 180000);

test("a floor holds down to exactly the number it says, and not a base unit below", async () => {
  const [floor] = await suggestedTransfer();
  const part = floor.sentence.find((p) => p.type === "amount");
  if (part?.type !== "amount") throw new Error("no amount");
  const answering = (balance: bigint) => ({
    [TOKEN]: { ...erc20, "balanceOf(address)": word("uint256", balance) },
  });
  // Simulated at 900.000001, less 1% of the 100 sent: 899.000001, said
  // and asserted as 899.
  const asserted = BigInt(part.value);
  expect(asserted).toBe(899_000_000n);
  expect(part.text).toBe("899 USDC");
  expect(floor.line).toBe(
    "assert @balance!($token $executor) >= @token:amount($token 899)",
  );
  await scriptHolds(suggestionScript([floor]), answering(900_000_001n));
  await scriptHolds(suggestionScript([floor]), answering(asserted));
  await expect(
    scriptHolds(suggestionScript([floor]), answering(asserted - 1n)),
  ).rejects.toThrow();
}, 180000);

test("an emptied sender's zero, and exact amounts, hold as scripts", async () => {
  // Every balance reads 0: the sender is emptied, and BOB's 0 contradicts
  // what he received, so he gets nothing.
  const emptied = await suggestionsHold(
    "token",
    events,
    [eventLog(TRANSFER, TOKEN, { from: SPENDER, to: BOB, value: 100n })],
    { [TOKEN]: { ...erc20, "balanceOf(address)": word("uint256", 0n) } },
  );
  expect(shown(emptied)).toMatchInlineSnapshot(`
    "erc20Transfer
      assert @balance!($token $sender) == 0
      0x0000...05BE is left with 0 USDC (0x0000...00e1)"
  `);
  const exact = await suggestionsHold(
    "token",
    events,
    [transfer(TOKEN, 100_000_000n)],
    { [TOKEN]: erc20 },
    { exact: true },
  );
  expect(shown(exact)).toMatchInlineSnapshot(`
    "erc20Transfer
      assert @balance!($token $executor) == @token:amount($token 900.000001)
      0x0000...0ec0 keeps exactly 900.000001 USDC (0x0000...00e1)
    erc20Transfer
      assert @balance!($token $recipient) == @token:amount($token 900.000001)
      0x0000...0B0b holds exactly 900.000001 USDC (0x0000...00e1)"
  `);
}, 180000);
