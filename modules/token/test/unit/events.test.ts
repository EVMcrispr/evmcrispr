import "../setup";
import { describe, expect, it } from "bun:test";
import { collectSuggestions } from "@evmcrispr/sdk";
import {
  EXECUTOR,
  eventLog,
  suggestEnv,
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
  collectSuggestions({
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
    expect(out.map((s) => s.line)).toEqual([
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 899`,
      `assert @balance!(${TOKEN} ${BOB}) >= 99`,
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
    expect(out.map((s) => s.line)).toContain(
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 40`,
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
    expect(out.map((s) => s.line)).toEqual([
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
    expect(out.map((s) => s.line)).toEqual([
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
      ).map((s) => s.line),
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
    expect(out.map((s) => s.line)).toEqual([
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
    expect(out.map((s) => s.line)).toEqual([
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
    expect(out.map((s) => s.line)).toEqual([
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
    expect(out.map((s) => s.line)).toEqual([
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 899`,
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
    expect(out.map((s) => s.line)).toEqual([
      `assert @balance!(${TOKEN} ${SPENDER}) >= 4`,
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
    expect(out.map((s) => s.line)).toEqual([
      `assert @balance!(${TOKEN} ${EXECUTOR}) >= 99`,
    ]);
    expect(out[0].description).not.toContain("can make this check fail");
  });
});
