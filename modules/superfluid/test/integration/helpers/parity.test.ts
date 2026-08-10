import "../../setup";
import {
  describeParity,
  installSelectorMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { helpers } from "../../../src/_generated";
import { RECEIVER, SOME_ADDRESS, USDCX, XDAIX } from "../../fixtures";

/**
 * @superfluid's stream reads, against the live Gnosis deployment.
 *
 * These are the faces where the two routes differ most: off-chain the module
 * reads through the CFA/GDA forwarders with viem, on-chain it staticcalls them
 * from the assertion. `@netflow` in particular has two shapes upstream
 * (`getAccountFlowrate` and `getNetFlow`), so agreeing means both faces picked
 * the same one.
 *
 * Signed values matter here: a net flow is negative for a net sender, which is
 * the Int path through the operand layer rather than the Uint one — and the
 * GDA reads below use negative flow rates on purpose for that reason.
 *
 * The pool reads have no live pool to point at, so they go against a mock
 * standing in for an ISuperfluidPool.
 *
 * `@connected`, `@distributionFlowrate` and `@buffer` are deliberately left
 * out. They read the GDA and CFA forwarders — fixed addresses that the live
 * netflow and flow cases above also read — so mocking either would replace
 * real answers with fixed ones for the whole suite. Measured, not assumed:
 * mocking the GDA forwarder broke `@netflow`, which turns out to route
 * through it too.
 */

/** Stands in for an ISuperfluidPool. */
const POOL = "0x0000000000000000000000000000000000900100";
const MEMBER = "0x1111111111111111111111111111111111111111";
const word = (t: string, v: unknown) =>
  encodeAbiParameters([{ type: t }], [v as never]);

describeParity("@superfluid", {
  module: "superfluid",
  helpers,
  setup: async (client) => {
    await installSelectorMock(client, POOL, [
      {
        selector: toFunctionSelector(
          "function getUnits(address) view returns (uint128)",
        ),
        data: word("uint128", 500n),
      },
      {
        selector: toFunctionSelector(
          "function getTotalUnits() view returns (uint128)",
        ),
        data: word("uint128", 1500n),
      },
      {
        // Negative on purpose: a member flow rate is signed, so this walks
        // the Int path rather than the Uint one.
        selector: toFunctionSelector(
          "function getMemberFlowRate(address) view returns (int96)",
        ),
        data: word("int96", -385802469135802n),
      },
      {
        // A tuple, so each face must take the FIRST word.
        selector: toFunctionSelector(
          "function getClaimableNow(address) view returns (int256,uint256)",
        ),
        data: encodeAbiParameters(
          [{ type: "int256" }, { type: "uint256" }],
          [-42n, 1700000000n],
        ),
      },
    ]);
  },
  cases: [
    {
      name: "units of a pool member",
      run: `@superfluid:units(${POOL} ${MEMBER})`,
      compile: `@superfluid:units!(${POOL} ${MEMBER})`,
    },
    {
      name: "totalUnits of a pool",
      run: `@superfluid:totalUnits(${POOL})`,
      compile: `@superfluid:totalUnits!(${POOL})`,
    },
    {
      name: "memberFlowrate is negative and signed",
      run: `@superfluid:memberFlowrate(${POOL} ${MEMBER})`,
      compile: `@superfluid:memberFlowrate!(${POOL} ${MEMBER})`,
    },
    {
      name: "claimable takes the balance, not the timestamp",
      run: `@superfluid:claimable(${POOL} ${MEMBER})`,
      compile: `@superfluid:claimable!(${POOL} ${MEMBER})`,
    },
    {
      name: "underlying resolves a wrapper SuperToken's asset",
      run: `@superfluid:underlying(${USDCX})`,
      compile: `@superfluid:underlying!(${USDCX})`,
    },
    {
      name: "balance of an account with no SuperToken position",
      run: `@superfluid:balance(${XDAIX} ${SOME_ADDRESS})`,
      compile: `@superfluid:balance!(${XDAIX} ${SOME_ADDRESS})`,
    },
    {
      name: "netflow of an account with no streams is zero",
      run: `@superfluid:netflow(${XDAIX} ${SOME_ADDRESS})`,
      compile: `@superfluid:netflow!(${XDAIX} ${SOME_ADDRESS})`,
    },
    {
      name: "flow between two accounts with no stream is zero",
      run: `@superfluid:flow(${XDAIX} ${SOME_ADDRESS} ${RECEIVER})`,
      compile: `@superfluid:flow!(${XDAIX} ${SOME_ADDRESS} ${RECEIVER})`,
    },
  ],
});
