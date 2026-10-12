import "../setup";
import { expect, test } from "bun:test";
import { eventLog, suggestionsHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const REGISTRY = getAddress("0x0000000000000000000000000000000000e05001");
const WHO = getAddress("0x0000000000000000000000000000000000e05002");
const NODE = keccak256(toHex("node"));
const LABEL = keccak256(toHex("label"));
const RESOLVER = getAddress("0x0000000000000000000000000000000000e05003");
const answer = (address: `0x${string}`) =>
  encodeAbiParameters([{ type: "address" }], [address]);

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what ens events suggest runs as a script and holds against the views read", async () => {
  const out = await suggestionsHold(
    "ens",
    events,
    [
      eventLog(
        "event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)",
        REGISTRY,
        { node: NODE, label: LABEL, owner: WHO },
      ),
      eventLog(
        "event Transfer(bytes32 indexed node, address owner)",
        REGISTRY,
        {
          node: NODE,
          owner: WHO,
        },
      ),
      eventLog(
        "event NewResolver(bytes32 indexed node, address resolver)",
        REGISTRY,
        { node: NODE, resolver: RESOLVER },
      ),
    ],
    {
      [REGISTRY]: {
        "owner(bytes32)": answer(WHO),
        "resolver(bytes32)": answer(RESOLVER),
      },
    },
  );
  expect(new Set(out.map((s) => s.event))).toEqual(
    new Set(Object.keys(events)),
  );
  expect(shown(out)).toMatchInlineSnapshot(`
    "newOwner
      assert $registry::!{owner(bytes32)(address) 0x749b6e3b6675e4d66d5a70f420941c2b210a3029a4441b2dfcc3136833314be1} == $owner
      The node created on 0x0000...5001 is owned by 0x0000...5002
    newResolver
      assert $registry::!{resolver(bytes32)(address) 0x7a7b069bdf427c3e6d24c2c55ccd9fe71f5d9a6088733138764bb52de1769157} == $resolver
      The resolver of the node set on 0x0000...5001 is 0x0000...5003
    transfer
      assert $registry::!{owner(bytes32)(address) 0x7a7b069bdf427c3e6d24c2c55ccd9fe71f5d9a6088733138764bb52de1769157} == $owner
      The node transferred on 0x0000...5001 is owned by 0x0000...5002"
  `);
}, 180000);
