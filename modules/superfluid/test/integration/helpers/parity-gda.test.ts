import "../../setup";
import { beforeAll, describe, it } from "bun:test";
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
 * `@claimable` is deliberately absent: getClaimableNow accrues per second, so
 * the two faces read it at different timestamps and differ legitimately.
 * Comparing it would measure the clock.
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
    ...(value === undefined ? {} : { value }),
  } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`GDA setup reverted at "${step}": ${hash}`);
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
    // Retried once. Building the fixture sends five transactions against a
    // shared anvil that the rest of the package is also using, and it has
    // failed intermittently for a reason not yet pinned down. A retry is
    // honest here because this is fixture CONSTRUCTION: if it were masking a
    // parity failure the comparison below would still catch it, and a setup
    // that fails outright fails the suite loudly rather than silently
    // skipping. Remove the retry once the cause is understood.
    try {
      await buildPool();
    } catch (first) {
      console.warn(`GDA fixture setup failed once, retrying: ${first}`);
      await buildPool();
    }
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

  it("distributionFlowrate into the pool", async () => {
    const [a, b] = await bothFaces(
      `@superfluid:distributionFlowrate(${XDAIX} ${ADMIN} ${POOL})`,
      `@superfluid:distributionFlowrate!(${XDAIX} ${ADMIN} ${POOL})`,
    );
    expectParity(a, b, "distributionFlowrate");
  }, 30_000);
});
