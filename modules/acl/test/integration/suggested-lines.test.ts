import "../setup";
import { expect, test } from "bun:test";
import { eventLog, suggestionsHold } from "@evmcrispr/test-utils/suggestions";
import { encodeAbiParameters, getAddress, keccak256, toHex } from "viem";
import { events } from "../../src/_generated";

const TARGET = getAddress("0x00000000000000000000000000000000000ac101");
const ALICE = getAddress("0x00000000000000000000000000000000000a11ce");
const ADMIN = getAddress("0x00000000000000000000000000000000000ad111");
const OWNER = getAddress("0x00000000000000000000000000000000000ac102");
const NEXT_OWNER = getAddress("0x00000000000000000000000000000000000ac103");
const NEXT_ADMIN = getAddress("0x00000000000000000000000000000000000ac104");
const ROLE = keccak256(toHex("MINTER_ROLE"));
const word = (type: string, value: unknown) =>
  encodeAbiParameters([{ type }], [value as never]);
const pair = (a: string, x: unknown, b: string, y: unknown) =>
  encodeAbiParameters([{ type: a }, { type: b }], [x as never, y as never]);
const GRANTED =
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)";
const REVOKED =
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)";
const MANAGER_GRANTED =
  "event RoleGranted(uint64 indexed roleId, address indexed account, uint32 delay, uint48 since, bool newMember)";
const MANAGER_REVOKED =
  "event RoleRevoked(uint64 indexed roleId, address indexed account)";

/** Each suggestion as a host has it: the line, then the sentence as text. */
const shown = (out: { event: string; line: string; description: string }[]) =>
  out.map((s) => `${s.event}\n  ${s.line}\n  ${s.description}`).join("\n");

test("what acl events suggest runs as a script and holds against the views read", async () => {
  const out = await suggestionsHold(
    "acl",
    events,
    [
      eventLog(GRANTED, TARGET, { role: ROLE, account: ALICE, sender: ADMIN }),
      eventLog(MANAGER_GRANTED, TARGET, {
        roleId: 7n,
        account: ALICE,
        delay: 0,
        since: 1,
        newMember: true,
      }),
      eventLog(
        "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
        TARGET,
        { role: ROLE, previousAdminRole: ROLE, newAdminRole: ROLE },
      ),
      eventLog(
        "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
        TARGET,
        { previousOwner: ADMIN, newOwner: OWNER },
      ),
      eventLog(
        "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
        TARGET,
        { previousOwner: ADMIN, newOwner: NEXT_OWNER },
      ),
      eventLog(
        "event DefaultAdminTransferScheduled(address indexed newAdmin, uint48 acceptSchedule)",
        TARGET,
        { newAdmin: NEXT_ADMIN, acceptSchedule: 9 },
      ),
      eventLog(
        "event DefaultAdminDelayChangeScheduled(uint48 newDelay, uint48 effectSchedule)",
        TARGET,
        { newDelay: 600, effectSchedule: 9 },
      ),
    ],
    {
      [TARGET]: {
        "hasRole(bytes32,address)": word("bool", true),
        "hasRole(uint64,address)": pair("bool", true, "uint32", 0),
        "getRoleAdmin(bytes32)": ROLE,
        "owner()": word("address", OWNER),
        "pendingOwner()": word("address", NEXT_OWNER),
        "pendingDefaultAdmin()": pair("address", NEXT_ADMIN, "uint48", 9),
        "pendingDefaultAdminDelay()": pair("uint48", 600, "uint48", 9),
      },
    },
  );
  expect(shown(out)).toMatchInlineSnapshot(`
    "defaultAdminDelayChangeScheduled
      assert $contract::!{pendingDefaultAdminDelay()(uint48,uint48)}[$ _] == 600
      The pending default admin delay of 0x0000...C101 is 600 seconds
    defaultAdminTransferScheduled
      assert @acl:pendingDefaultAdmin!($contract) == $pendingAdmin
      0x0000...c104 is the pending default admin of 0x0000...C101
    managerRoleGranted
      assert @acl:hasRole!($contract 7 $account) == true
      0x0000...11cE is a member of role 7 on 0x0000...C101
    ownershipTransferStarted
      assert @acl:pendingOwner!($contract) == $pendingOwner
      0x0000...c103 is the pending owner of 0x0000...C101
    ownershipTransferred
      assert @acl:owner!($contract) == $owner
      0x0000...C101 is owned by 0x0000...C102
    roleAdminChanged
      assert @acl:roleAdmin!($contract 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6) == 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6
      The admin role of a role on 0x0000...C101 is the one that was set
    roleGranted
      assert @acl:hasRole!($contract 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6 $account) == true
      0x0000...11cE holds the role it was granted on 0x0000...C101"
  `);
  const revoked = await suggestionsHold(
    "acl",
    events,
    [
      eventLog(REVOKED, TARGET, { role: ROLE, account: ALICE, sender: ADMIN }),
      eventLog(MANAGER_REVOKED, TARGET, { roleId: 7n, account: ALICE }),
    ],
    {
      [TARGET]: {
        "hasRole(bytes32,address)": word("bool", false),
        "hasRole(uint64,address)": pair("bool", false, "uint32", 0),
      },
    },
  );
  expect(shown(revoked)).toMatchInlineSnapshot(`
    "managerRoleRevoked
      assert @acl:hasRole!($contract 7 $account) == false
      0x0000...11cE is no longer a member of role 7 on 0x0000...C101
    roleRevoked
      assert @acl:hasRole!($contract 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6 $account) == false
      0x0000...11cE no longer holds the role revoked on 0x0000...C101"
  `);
  expect(new Set([...out, ...revoked].map((s) => s.event))).toEqual(
    new Set(Object.keys(events)),
  );
}, 180000);
