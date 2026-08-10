import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import {
  expect,
  getPublicClient,
  getWalletClients,
} from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  type Norm,
  normalizeRun,
  resolveValue,
  runExpression,
  sameValue,
  show,
} from "@evmcrispr/test-utils/onchain";
import { decodeEventLog, encodeFunctionData, parseAbi } from "viem";
import { anvilUrl } from "../../../../../scripts/anvil-config";
import { GDA_FORWARDER, RATE_1000_PER_MONTH, XDAIX } from "../../fixtures";

/**
 * The GDA (pool) reads, against a pool BUILT on the fork.
 *
 * The fork has no distribution pool, and mocking these replaced the GDA
 * forwarder — which the live netflow and flow reads also use — so it broke
 * them. Building a real pool avoids both: every read answers about genuine
 * Superfluid state and the forwarder stays real for the rest of the suite.
 *
 * Written against the harness primitives rather than `describeParity`,
 * because the pool address is not known until the pool exists. describeParity
 * needs its expressions when the suite is DECLARED, which is before any
 * setup runs, so the address would have to be predicted — and predicting it
 * from the forwarder's nonce is what made an earlier version of this file
 * fail intermittently, since any other test touching that nonce first
 * invalidated the guess. Here the address comes out of the creation receipt
 * and the expressions are built inside each test.
 *
 * `@claimable` needed care rather than exclusion. It accrues, so comparing it
 * would seem to measure the clock — but anvil evaluates an `eth_call` against
 * the last MINED block, not wall-clock, so both faces see the same timestamp
 * as long as nothing mines between them, and the value is stable. Measured
 * before relying on it: two reads 2.5s apart returned identical values and
 * the same reported timestamp.
 *
 * To make it a real number rather than zero, chain time is advanced once after
 * the flow starts. A second member is given units and never connects, which is
 * what makes their share accrue as CLAIMABLE instead of landing in their
 * real-time balance.
 */

const GDA = parseAbi([
  "function createPool(address token, address admin, (bool transferabilityForUnitsOwner, bool distributionFromAnyAddress) config) returns (bool, address)",
  "function updateMemberUnits(address pool, address memberAddr, uint128 newUnits, bytes userData) returns (bool)",
  "function connectPool(address pool, bytes userData) returns (bool)",
  "function distributeFlow(address token, address from, address pool, int96 requestedFlowRate, bytes userData) returns (bool)",
  "event PoolCreated(address indexed token, address indexed admin, address pool)",
]);
const NATIVE_SUPERTOKEN = parseAbi(["function upgradeByETH() payable"]);

const UNITS = 500n;

const pub = getPublicClient();
// The last two of the ten funded anvil accounts, so the transactions below do
// not share a nonce with whatever else the package is doing.
const wallets = getWalletClients();
const adminWallet = wallets[8]!;
const memberWallet = wallets[9]!;
/** Given units but never connected, so its share accrues as claimable. */
const UNCLAIMED = wallets[7]!.account!.address;
const ADMIN = adminWallet.account!.address;
const MEMBER = memberWallet.account!.address;

let POOL: `0x${string}`;
let CORE: `0x${string}`;
let OPERATORS: `0x${string}`;

async function send(
  step: string,
  wallet: typeof adminWallet,
  to: string,
  data: `0x${string}`,
  value?: bigint,
) {
  const hash = await wallet.sendTransaction({
    to: to as `0x${string}`,
    data,
    // An explicit limit rather than viem's estimate. Superfluid runs agreement
    // callbacks, and EIP-150 gives an inner call only 63/64 of what remains —
    // so a limit that is exactly enough for the whole transaction can still
    // starve the callback, which reverts with no data while the outer frame
    // still has budget. That shows up as a revert whose gasUsed is BELOW the
    // limit, and which eth_call cannot reproduce because a call runs with a
    // huge gas cap. It made distributeFlow fail on roughly half of fresh forks.
    gas: 3_000_000n,
    ...(value === undefined ? {} : { value }),
  } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    // Replay the call at the block it reverted in, so the error carries the
    // reason rather than only a hash nobody can look up afterwards.
    let reason = "no reason returned";
    const raw = (await fetch(anvilUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          {
            from: wallet.account!.address,
            to,
            data,
            ...(value === undefined
              ? {}
              : { value: `0x${value.toString(16)}` }),
          },
          `0x${(receipt.blockNumber - 1n).toString(16)}`,
        ],
      }),
    }).then((r) => r.json())) as {
      error?: { message?: string; data?: string };
    };
    if (raw.error) {
      reason = `${raw.error.message ?? ""} data=${raw.error.data ?? "none"}`;
    }
    const tx = await pub.getTransaction({ hash });
    throw new Error(
      `GDA setup reverted at "${step}" (${hash}): ${reason} | gasUsed=${receipt.gasUsed} gasLimit=${tx.gas}`,
    );
  }
  return receipt;
}

/** Compare one expression across both faces. */
async function bothFaces(run: string, compile: string): Promise<[Norm, Norm]> {
  const { operand } = await compileExpression(compile, {
    module: "superfluid",
    core: CORE,
    operators: OPERATORS,
  });
  const onchain = await resolveValue(pub, operand, { core: CORE });
  const offchain = normalizeRun(
    await runExpression(run, { module: "superfluid" }),
  );
  return [offchain, onchain];
}

function expectParity(offchain: Norm, onchain: Norm, label: string) {
  expect(
    sameValue(offchain, onchain),
    `${label}\n  run     -> ${show(offchain)}\n  compile -> ${show(onchain)}`,
  ).to.be.true;
}

describe("@superfluid GDA > parity", () => {
  beforeAll(async () => {
    ({ core: CORE, operators: OPERATORS } = await installAssertionsCore(pub));
    await buildPool();
    // Advance chain time ONCE, so the distribution has actually accrued and
    // @claimable is a real number rather than zero. Everything below then
    // reads one fixed block: anvil evaluates an eth_call against the last
    // MINED block, so both faces see the same elapsed time and nothing drifts
    // between them.
    await pub.request({ method: "evm_increaseTime", params: [3600] } as never);
    await pub.request({ method: "evm_mine", params: [] } as never);
  }, 180_000);

  async function buildPool() {
    await send(
      "wrap xDAI into xDAIx",
      adminWallet,
      XDAIX,
      encodeFunctionData({
        abi: NATIVE_SUPERTOKEN,
        functionName: "upgradeByETH",
      }),
      500n * 10n ** 18n,
    );

    // The pool address comes from the receipt, not from a prediction.
    const receipt = await send(
      "createPool",
      adminWallet,
      GDA_FORWARDER,
      encodeFunctionData({
        abi: GDA,
        functionName: "createPool",
        args: [
          XDAIX as `0x${string}`,
          ADMIN,
          {
            transferabilityForUnitsOwner: false,
            distributionFromAnyAddress: false,
          },
        ] as never,
      }),
    );
    for (const log of receipt.logs) {
      try {
        const parsed = decodeEventLog({
          abi: GDA,
          data: log.data,
          topics: log.topics,
        });
        if (parsed.eventName === "PoolCreated") {
          POOL = (parsed.args as unknown as { pool: `0x${string}` }).pool;
        }
      } catch {
        // Not a GDA event; the receipt carries the token's logs too.
      }
    }
    if (!POOL) throw new Error("no PoolCreated event in the creation receipt");

    await send(
      "updateMemberUnits",
      adminWallet,
      GDA_FORWARDER,
      encodeFunctionData({
        abi: GDA,
        functionName: "updateMemberUnits",
        args: [POOL, MEMBER, UNITS, "0x"],
      }),
    );
    // The member connects itself; nobody else can.
    await send(
      "connectPool",
      memberWallet,
      GDA_FORWARDER,
      encodeFunctionData({
        abi: GDA,
        functionName: "connectPool",
        args: [POOL, "0x"],
      }),
    );
    await send(
      "updateMemberUnits (unclaimed member)",
      adminWallet,
      GDA_FORWARDER,
      encodeFunctionData({
        abi: GDA,
        functionName: "updateMemberUnits",
        args: [POOL, UNCLAIMED, UNITS, "0x"],
      }),
    );
    await send(
      "distributeFlow",
      adminWallet,
      GDA_FORWARDER,
      encodeFunctionData({
        abi: GDA,
        functionName: "distributeFlow",
        args: [XDAIX as `0x${string}`, ADMIN, POOL, RATE_1000_PER_MONTH, "0x"],
      }),
    );
  }

  it("totalUnits of a pool that has one member", async () => {
    const [a, b] = await bothFaces(
      `@superfluid:totalUnits(${POOL})`,
      `@superfluid:totalUnits!(${POOL})`,
    );
    expectParity(a, b, "totalUnits");
  }, 30_000);

  it("units of that member, and of an address holding none", async () => {
    const [a, b] = await bothFaces(
      `@superfluid:units(${POOL} ${MEMBER})`,
      `@superfluid:units!(${POOL} ${MEMBER})`,
    );
    expectParity(a, b, "units (member)");
    const [c, d] = await bothFaces(
      `@superfluid:units(${POOL} ${ADMIN})`,
      `@superfluid:units!(${POOL} ${ADMIN})`,
    );
    expectParity(c, d, "units (non-member)");
  }, 30_000);

  it("memberFlowrate of a connected member receiving a flow", async () => {
    // Non-zero because a flow is running: the point of setting one up rather
    // than reading an idle pool. A flow RATE is stable, unlike a balance.
    const [a, b] = await bothFaces(
      `@superfluid:memberFlowrate(${POOL} ${MEMBER})`,
      `@superfluid:memberFlowrate!(${POOL} ${MEMBER})`,
    );
    expectParity(a, b, "memberFlowrate");
  }, 30_000);

  it("connected, in both directions", async () => {
    const [a, b] = await bothFaces(
      `@superfluid:connected(${POOL} ${MEMBER})`,
      `@superfluid:connected!(${POOL} ${MEMBER})`,
    );
    expectParity(a, b, "connected (member)");
    // The admin never connected.
    const [c, d] = await bothFaces(
      `@superfluid:connected(${POOL} ${ADMIN})`,
      `@superfluid:connected!(${POOL} ${ADMIN})`,
    );
    expectParity(c, d, "connected (never connected)");
  }, 30_000);

  it("claimable of a member who never connected", async () => {
    // Non-zero: an hour of the distribution has accrued to a member whose
    // share is not being streamed into their balance.
    const [a, b] = await bothFaces(
      `@superfluid:claimable(${POOL} ${UNCLAIMED})`,
      `@superfluid:claimable!(${POOL} ${UNCLAIMED})`,
    );
    expectParity(a, b, "claimable (never connected)");
    // Guard against the case going vacuous: if the time advance or the units
    // ever stop taking effect this reads zero on BOTH faces and would pass
    // while testing nothing.
    expect(a.t, "claimable should be numeric").to.equal("num");
    expect(
      a.t === "num" && !a.v.eq(Num(0n)),
      `claimable accrued nothing (${show(a)}) — the fixture is not distributing`,
    ).to.be.true;
  }, 30_000);

  it("distributionFlowrate into the pool", async () => {
    const [a, b] = await bothFaces(
      `@superfluid:distributionFlowrate(${XDAIX} ${ADMIN} ${POOL})`,
      `@superfluid:distributionFlowrate!(${XDAIX} ${ADMIN} ${POOL})`,
    );
    expectParity(a, b, "distributionFlowrate");
  }, 30_000);
});
