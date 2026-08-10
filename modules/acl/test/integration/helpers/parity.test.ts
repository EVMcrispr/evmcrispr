import "../../setup";
import {
  describeParity,
  installSelectorMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @acl against real access-controlled contracts on the Gnosis fork.
 *
 * Aave's ACLManager is a live OpenZeppelin AccessControl, and the two
 * PoolAddressesProviders are Ownable, so the role and ownership reads have
 * genuine state to answer about rather than a mock's fixed blob.
 *
 * The AccessManager and two-step-ownership reads have no live counterpart —
 * nothing on the fork is an AccessManager or caught mid-handover — so those go
 * against a selector-dispatching mock. Weaker, and the point stands only as
 * far as it goes: each issues the same call on both faces and decodes the
 * bytes the same way.
 *
 * Two of them return TUPLES, which is where the two faces could genuinely
 * part company: `canCall` gives (immediate, delay) and `pendingDefaultAdmin`
 * gives (newAdmin, acceptSchedule), and each helper takes only the first —
 * so a face reading the wrong word would show up here.
 */

/** Aave v3 ACLManager: OpenZeppelin AccessControl. */
const ACL = "0xEc710f59005f48703908bC519D552Df5B8472614";
/** Holds DEFAULT_ADMIN_ROLE on the manager above. */
const ADMIN = "0x1dF462e2712496373A347f8ad10802a5E95f053D";
/** An account holding no role at all. */
const NOBODY = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Ownable: the Aave and Spark PoolAddressesProviders. */
const AAVE_PROVIDER = "0x36616cf17557639614c1cdDb356b1B83fc0B2132";
const SPARK_PROVIDER = "0xA98DaCB3fC964A6A0d2ce3B77294241585EAbA6d";

/** An AccessManager / Ownable2Step / AccessControlDefaultAdminRules mock. */
const MGR = "0x0000000000000000000000000000000000ac1001";
const ADDR = "0x1111111111111111111111111111111111111111";
const OP_ID =
  "0x00000000000000000000000000000000000000000000000000000000000000aa";

describeParity("@acl", {
  module: "acl",
  helpers,
  setup: (client) =>
    installSelectorMock(client, MGR, [
      {
        selector: toFunctionSelector(
          "function canCall(address,address,bytes4) view returns (bool,uint32)",
        ),
        data: encodeAbiParameters(
          [{ type: "bool" }, { type: "uint32" }],
          [true, 60],
        ),
      },
      {
        selector: toFunctionSelector(
          "function defaultAdmin() view returns (address)",
        ),
        data: encodeAbiParameters([{ type: "address" }], [ADDR]),
      },
      {
        selector: toFunctionSelector(
          "function defaultAdminDelay() view returns (uint48)",
        ),
        data: encodeAbiParameters([{ type: "uint48" }], [86400]),
      },
      {
        selector: toFunctionSelector(
          "function pendingDefaultAdmin() view returns (address,uint48)",
        ),
        data: encodeAbiParameters(
          [{ type: "address" }, { type: "uint48" }],
          [ADDR, 1234],
        ),
      },
      {
        selector: toFunctionSelector(
          "function pendingOwner() view returns (address)",
        ),
        data: encodeAbiParameters([{ type: "address" }], [ADDR]),
      },
      {
        selector: toFunctionSelector(
          "function hashOperation(address,address,bytes) view returns (bytes32)",
        ),
        data: encodeAbiParameters([{ type: "bytes32" }], [OP_ID]),
      },
      {
        selector: toFunctionSelector(
          "function getSchedule(bytes32) view returns (uint48)",
        ),
        data: encodeAbiParameters([{ type: "uint48" }], [999]),
      },
    ]),
  cases: [
    {
      // A tuple return where each face must take the FIRST word.
      name: "canCall reads the immediate flag, not the delay",
      run: `@acl:canCall(${MGR} ${ADDR} ${ADDR} "transfer(address,uint256)")`,
      compile: `@acl:canCall!(${MGR} ${ADDR} ${ADDR} "transfer(address,uint256)")`,
    },
    {
      name: "defaultAdmin",
      run: `@acl:defaultAdmin(${MGR})`,
      compile: `@acl:defaultAdmin!(${MGR})`,
    },
    {
      name: "defaultAdminDelay",
      run: `@acl:defaultAdminDelay(${MGR})`,
      compile: `@acl:defaultAdminDelay!(${MGR})`,
    },
    {
      // The other tuple: the pending admin, not the accept schedule.
      name: "pendingDefaultAdmin reads the admin, not the schedule",
      run: `@acl:pendingDefaultAdmin(${MGR})`,
      compile: `@acl:pendingDefaultAdmin!(${MGR})`,
    },
    {
      name: "pendingOwner",
      run: `@acl:pendingOwner(${MGR})`,
      compile: `@acl:pendingOwner!(${MGR})`,
    },
    {
      name: "operationId hashes the operation",
      run: `@acl:operationId(${MGR} ${ADDR} ${ADDR} "transfer(address,uint256)" [${ADDR} 1])`,
      compile: `@acl:operationId!(${MGR} ${ADDR} ${ADDR} "transfer(address,uint256)" [${ADDR} 1])`,
    },
    {
      name: "operationSchedule",
      run: `@acl:operationSchedule(${MGR} ${OP_ID})`,
      compile: `@acl:operationSchedule!(${MGR} ${OP_ID})`,
    },
    {
      name: "owner of an Ownable contract",
      run: `@acl:owner(${AAVE_PROVIDER})`,
      compile: `@acl:owner!(${AAVE_PROVIDER})`,
    },
    {
      name: "owner of a second Ownable contract",
      run: `@acl:owner(${SPARK_PROVIDER})`,
      compile: `@acl:owner!(${SPARK_PROVIDER})`,
    },
    {
      name: "hasRole is true for an account that holds it",
      run: `@acl:hasRole(${ACL} ${DEFAULT_ADMIN_ROLE} ${ADMIN})`,
      compile: `@acl:hasRole!(${ACL} ${DEFAULT_ADMIN_ROLE} ${ADMIN})`,
    },
    {
      // The false direction: an account with no role must come back false,
      // not merely fail to come back true.
      name: "hasRole is false for an account that does not",
      run: `@acl:hasRole(${ACL} ${DEFAULT_ADMIN_ROLE} ${NOBODY})`,
      compile: `@acl:hasRole!(${ACL} ${DEFAULT_ADMIN_ROLE} ${NOBODY})`,
    },
    {
      name: "roleAdmin of the default admin role",
      run: `@acl:roleAdmin(${ACL} ${DEFAULT_ADMIN_ROLE})`,
      compile: `@acl:roleAdmin!(${ACL} ${DEFAULT_ADMIN_ROLE})`,
    },
  ],
});
