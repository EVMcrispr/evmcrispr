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

const TARGET = getAddress("0x00000000000000000000000000000000000ac101");
const ALICE = getAddress("0x00000000000000000000000000000000000a11ce");
const ADMIN = getAddress("0x00000000000000000000000000000000000ad111");
const ROLE = keccak256(toHex("MINTER_ROLE"));
const ZERO_ROLE = `0x${"00".repeat(32)}`;
const run = (
  logs: ReturnType<typeof eventLog>[],
  answers: Record<string, unknown>,
) =>
  suggested({
    modules: [{ name: "acl", events }],
    logs,
    env: suggestEnv(answers),
  });
const lines = async (...a: Parameters<typeof run>) =>
  (await run(...a)).map(literalLine);

const GRANTED =
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)";
const REVOKED =
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)";

describe("acl events", () => {
  it("a granted role is confirmed by hasRole", async () => {
    const log = eventLog(GRANTED, TARGET, {
      role: ROLE,
      account: ALICE,
      sender: ADMIN,
    });
    expect(
      await lines([log], { [viewKey(TARGET, "hasRole", ROLE, ALICE)]: true }),
    ).toEqual([`assert @acl:hasRole!(${TARGET} ${ROLE} ${ALICE}) == true`]);
    // Emitted, not honoured.
    expect(
      await lines([log], { [viewKey(TARGET, "hasRole", ROLE, ALICE)]: false }),
    ).toEqual([]);
    // No such view.
    expect(await lines([log], {})).toEqual([]);
  });

  it("granted then revoked in one run leaves the final state only", async () => {
    const out = await lines(
      [
        eventLog(GRANTED, TARGET, {
          role: ROLE,
          account: ALICE,
          sender: ADMIN,
        }),
        eventLog(REVOKED, TARGET, {
          role: ROLE,
          account: ALICE,
          sender: ADMIN,
        }),
      ],
      { [viewKey(TARGET, "hasRole", ROLE, ALICE)]: false },
    );
    expect(out).toEqual([
      `assert @acl:hasRole!(${TARGET} ${ROLE} ${ALICE}) == false`,
    ]);
  });

  it("role admin, owner and pending owner", async () => {
    expect(
      await lines(
        [
          eventLog(
            "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
            TARGET,
            { role: ROLE, previousAdminRole: ZERO_ROLE, newAdminRole: ROLE },
          ),
        ],
        { [viewKey(TARGET, "getRoleAdmin", ROLE)]: ROLE },
      ),
    ).toEqual([`assert @acl:roleAdmin!(${TARGET} ${ROLE}) == ${ROLE}`]);
    expect(
      await lines(
        [
          eventLog(
            "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
            TARGET,
            { previousOwner: ADMIN, newOwner: ALICE },
          ),
        ],
        { [viewKey(TARGET, "owner")]: ALICE },
      ),
    ).toEqual([`assert @acl:owner!(${TARGET}) == ${ALICE}`]);
    expect(
      await lines(
        [
          eventLog(
            "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
            TARGET,
            { previousOwner: ADMIN, newOwner: ALICE },
          ),
        ],
        { [viewKey(TARGET, "pendingOwner")]: ALICE },
      ),
    ).toEqual([`assert @acl:pendingOwner!(${TARGET}) == ${ALICE}`]);
  });

  it("default admin rules", async () => {
    expect(
      await lines(
        [
          eventLog(
            "event DefaultAdminTransferScheduled(address indexed newAdmin, uint48 acceptSchedule)",
            TARGET,
            { newAdmin: ALICE, acceptSchedule: 9 },
          ),
        ],
        { [viewKey(TARGET, "pendingDefaultAdmin")]: [ALICE, 9] },
      ),
    ).toEqual([`assert @acl:pendingDefaultAdmin!(${TARGET}) == ${ALICE}`]);
    expect(
      await lines(
        [
          eventLog(
            "event DefaultAdminDelayChangeScheduled(uint48 newDelay, uint48 effectSchedule)",
            TARGET,
            { newDelay: 600, effectSchedule: 9 },
          ),
        ],
        { [viewKey(TARGET, "pendingDefaultAdminDelay")]: [600, 9] },
      ),
    ).toEqual([
      `assert ${TARGET}::!{pendingDefaultAdminDelay()(uint48,uint48)}[$ _] == 600`,
    ]);
  });

  it("AccessManager roles are numeric and confirmed by its own hasRole", async () => {
    expect(
      await lines(
        [
          eventLog(
            "event RoleGranted(uint64 indexed roleId, address indexed account, uint32 delay, uint48 since, bool newMember)",
            TARGET,
            { roleId: 7n, account: ALICE, delay: 0, since: 1, newMember: true },
          ),
        ],
        { [viewKey(TARGET, "hasRole", 7n, ALICE)]: [true, 0] },
      ),
    ).toEqual([`assert @acl:hasRole!(${TARGET} 7 ${ALICE}) == true`]);
    expect(
      await lines(
        [
          eventLog(
            "event RoleRevoked(uint64 indexed roleId, address indexed account)",
            TARGET,
            { roleId: 7n, account: ALICE },
          ),
        ],
        { [viewKey(TARGET, "hasRole", 7n, ALICE)]: [false, 0] },
      ),
    ).toEqual([`assert @acl:hasRole!(${TARGET} 7 ${ALICE}) == false`]);
  });

  it("every declared event is exercised by this file", async () => {
    const source = await Bun.file(import.meta.path).text();
    for (const [name, entry] of Object.entries(events)) {
      expect(source, name).toContain(entry.event);
    }
  });
});
