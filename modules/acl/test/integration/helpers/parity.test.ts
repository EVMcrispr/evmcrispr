import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/**
 * @acl against real access-controlled contracts on the Gnosis fork.
 *
 * Aave's ACLManager is a live OpenZeppelin AccessControl, and the two
 * PoolAddressesProviders are Ownable, so the role and ownership reads have
 * genuine state to answer about rather than a mock's fixed blob.
 *
 * `@canCall`, `@operationId`, `@operationSchedule`, `@pendingOwner` and
 * `@pendingDefaultAdmin` need an AccessManager / a two-step ownership handover
 * mid-flight. Nothing on the fork is in that state, so they stay uncovered
 * here rather than being pinned against something contrived.
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

describeParity("@acl", {
  module: "acl",
  helpers,
  cases: [
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
