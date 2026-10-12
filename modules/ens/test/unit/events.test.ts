import "../setup";
import { describe, expect, it } from "bun:test";
import { collectSuggestions } from "@evmcrispr/sdk";
import {
  eventLog,
  suggestEnv,
  viewKey,
} from "@evmcrispr/test-utils/suggestions";
import { encodePacked, getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const REGISTRY = getAddress("0x0000000000000000000000000000000000e05001");
const WHO = getAddress("0x0000000000000000000000000000000000e05002");
const NODE = keccak256(toHex("node"));
const LABEL = keccak256(toHex("label"));
const SUBNODE = keccak256(encodePacked(["bytes32", "bytes32"], [NODE, LABEL]));
const lines = async (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  (
    await collectSuggestions({
      modules: [{ name: "ens", events }],
      logs,
      env: suggestEnv(answers),
    })
  ).map((s) => s.line);

describe("ens events", () => {
  it("a new subnode owner", async () => {
    const log = eventLog(
      "event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)",
      REGISTRY,
      { node: NODE, label: LABEL, owner: WHO },
    );
    expect(
      await lines([log], { [viewKey(REGISTRY, "owner", SUBNODE)]: WHO }),
    ).toEqual([
      `assert ${REGISTRY}::!{owner(bytes32)(address) ${SUBNODE}} == ${WHO}`,
    ]);
    expect(await lines([log], {})).toEqual([]);
  });

  it("a transferred node and a new resolver", async () => {
    expect(
      await lines(
        [
          eventLog(
            "event Transfer(bytes32 indexed node, address owner)",
            REGISTRY,
            { node: NODE, owner: WHO },
          ),
        ],
        {
          [viewKey(REGISTRY, "owner", NODE)]: WHO,
        },
      ),
    ).toEqual([
      `assert ${REGISTRY}::!{owner(bytes32)(address) ${NODE}} == ${WHO}`,
    ]);
    expect(
      await lines(
        [
          eventLog(
            "event NewResolver(bytes32 indexed node, address resolver)",
            REGISTRY,
            { node: NODE, resolver: WHO },
          ),
        ],
        {
          [viewKey(REGISTRY, "resolver", NODE)]: WHO,
        },
      ),
    ).toEqual([
      `assert ${REGISTRY}::!{resolver(bytes32)(address) ${NODE}} == ${WHO}`,
    ]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events))
      expect(source, name).toContain(entry.event);
  });
});
