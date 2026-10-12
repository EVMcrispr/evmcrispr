import "../setup";
import { describe, expect, it } from "bun:test";
import {
  eventLog,
  literalLine,
  suggestEnv,
  suggested,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const GOV = getAddress("0x00000000000000000000000000000000000060f1");
const WHO = getAddress("0x00000000000000000000000000000000000060f2");
const ID = keccak256(toHex("operation"));
const lines = async (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  (
    await suggested({
      modules: [{ name: "governor", events }],
      logs,
      env: suggestEnv(answers),
    })
  ).map(literalLine);

const CREATED =
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)";
const SCHEDULED =
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)";

describe("governor events", () => {
  it("a created proposal exists: its state can be read and is pending", async () => {
    const log = eventLog(CREATED, GOV, {
      proposalId: 42n,
      proposer: WHO,
      targets: [],
      values: [],
      signatures: [],
      calldatas: [],
      voteStart: 1n,
      voteEnd: 2n,
      description: "d",
    });
    expect(await lines([log], { [viewKey(GOV, "state", 42n)]: 0 })).toEqual([
      `assert ${GOV}::!{state(uint256)(uint8) 42} == 0`,
    ]);
    expect(await lines([log], {})).toEqual([]);
  });

  it("a scheduled timelock operation is pending", async () => {
    const log = eventLog(SCHEDULED, GOV, {
      id: ID,
      index: 0n,
      target: WHO,
      value: 0n,
      data: "0x",
      predecessor: `0x${"00".repeat(32)}`,
      delay: 10n,
    });
    expect(
      await lines([log, log], {
        [viewKey(GOV, "isOperationPending", ID)]: true,
      }),
    ).toEqual([
      `assert ${GOV}::!{isOperationPending(bytes32)(bool) ${ID}} == true`,
    ]);
  });

  it("a changed minimum delay", async () => {
    const log = eventLog(
      "event MinDelayChange(uint256 oldDuration, uint256 newDuration)",
      GOV,
      { oldDuration: 1n, newDuration: 3600n },
    );
    expect(
      await lines([log], { [viewKey(GOV, "getMinDelay")]: 3600n }),
    ).toEqual([`assert @governor:timelockMinDelay!(${GOV}) == 3600`]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
