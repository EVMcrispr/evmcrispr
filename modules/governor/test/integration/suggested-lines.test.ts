import "../setup";
import { expect, test } from "bun:test";
import { eventLog, suggestionsHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const GOV = getAddress("0x00000000000000000000000000000000000060f1");
const WHO = getAddress("0x00000000000000000000000000000000000060f2");
const ID = keccak256(toHex("operation"));

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what governor events suggest runs as a script and holds against the views read", async () => {
  const out = await suggestionsHold(
    "governor",
    events,
    [
      eventLog(
        "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
        GOV,
        {
          proposalId: 42n,
          proposer: WHO,
          targets: [],
          values: [],
          signatures: [],
          calldatas: [],
          voteStart: 1n,
          voteEnd: 2n,
          description: "d",
        },
      ),
      eventLog(
        "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
        GOV,
        {
          id: ID,
          index: 0n,
          target: WHO,
          value: 0n,
          data: "0x",
          predecessor: ID,
          delay: 1n,
        },
      ),
      eventLog(
        "event MinDelayChange(uint256 oldDuration, uint256 newDuration)",
        GOV,
        { oldDuration: 1n, newDuration: 3600n },
      ),
    ],
    {
      [GOV]: {
        "state(uint256)": encodeAbiParameters([{ type: "uint8" }], [0]),
        "isOperationPending(bytes32)": encodeAbiParameters(
          [{ type: "bool" }],
          [true],
        ),
        "getMinDelay()": encodeAbiParameters([{ type: "uint256" }], [3600n]),
      },
    },
  );
  expect(new Set(out.map((s) => s.event))).toEqual(
    new Set(Object.keys(events)),
  );
  expect(shown(out)).toMatchInlineSnapshot(`
    "callScheduled
      assert $contract::!{isOperationPending(bytes32)(bool) 0x1f1cfe8670c20aaace011af83ca6696c433437a1fe08af3412db149a98fdc6c1} == true
      The operation scheduled on 0x0000...60F1 is pending
    minDelayChange
      assert @governor:timelockMinDelay!($contract) == 3600
      0x0000...60F1 waits at least 3600 seconds
    proposalCreated
      assert $contract::!{state(uint256)(uint8) 42} == 0
      The proposal created on 0x0000...60F1 is pending"
  `);
}, 180000);
