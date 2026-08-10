import "../setup";
import { beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  type Norm,
  resolveValue,
} from "@evmcrispr/test-utils/onchain";
import type { Address } from "viem";

/**
 * `::!` read hops, resolved against the real contracts.
 *
 * These shapes are the ones whose meaning depends on WHICH hop of a chain
 * carries the read marker, so they are what a change to where that marker
 * is written can silently break. The values were captured from the retired
 * `!::` spelling before the parser moved, which is the point: the marker
 * changed position, the compiled expression must not have.
 *
 * Values that track the fork head are asserted as relationships rather
 * than literals (`decimals()` is the one genuine constant). A number
 * pinned here would go stale on the next fork bump and say nothing about
 * the parser.
 */

/** Gnosis fork. Verified to have code and answer these selectors. */
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
/** ERC-4626 whose `asset()` is WXDAI, so a chain through it is checkable. */
const SDAI = "0xaf204776c7245bF4147c2612BF6e5972Ee483701";
/** A holder with a non-zero WXDAI balance. */
const AWXDAI = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";
/** Honeyswap WXDAI/HNY, resolved through the factory rather than guessed. */
const PAIR = "0x4505b262DC053998C10685DC5F9098af8AE5C8ad";

let CORE: Address;
let OPERATORS: Address;

async function read(expression: string): Promise<Norm> {
  const { operand } = await compileExpression(expression, {
    core: CORE,
    operators: OPERATORS,
  });
  return resolveValue(getPublicClient(), operand, { core: CORE });
}

/** Every shape here resolves to a single word. */
async function num(expression: string): Promise<bigint> {
  const value = await read(expression);
  if (value.t !== "num") {
    throw new Error(`expected a number from ${expression}, got ${value.t}`);
  }
  return BigInt(value.v.toString());
}

describe("std > ::! read hops (resolved)", () => {
  beforeAll(async () => {
    ({ core: CORE, operators: OPERATORS } = await installAssertionsCore(
      getPublicClient(),
    ));
  });

  it("reads from an address literal with a constant argument", async () => {
    const balance = await num(
      `${WXDAI}::!{balanceOf(address)(uint256) ${AWXDAI}}`,
    );
    expect(balance > 0n).to.be.true;
  }, 30_000);

  it("reads after a plain hop resolved the target", async () => {
    // The marker is on hop 2, so hop 1 staticcalls `asset()` and the read
    // targets what it returned. Equals WXDAI's own totalSupply.
    const chained = await num(
      `${SDAI}::{asset()(address)}::!{totalSupply()(uint256)}`,
    );
    expect(chained).to.equal(await num(`${WXDAI}::{totalSupply()(uint256)}`));
  }, 30_000);

  it("continues a chain past a read hop", async () => {
    // Marker on hop 1 this time: the read resolves the address that hop 2
    // then staticcalls. The inverse arrangement of the case above, and the
    // pair is what a marker that bound to the wrong hop would break.
    expect(
      await num(`${SDAI}::!{asset()(address)}::{decimals()(uint8)}`),
    ).to.equal(18n);
  }, 30_000);

  it("applies a lens to a read, picking through the core", async () => {
    const reserve = await num(
      `${PAIR}::!{getReserves()(uint112,uint112,uint32)}[$ _ _]`,
    );
    expect(reserve > 0n).to.be.true;
  }, 30_000);

  it("splices a live call argument into a read", async () => {
    const assets = await num(
      `${SDAI}::!{convertToAssets(uint256)(uint256) ${WXDAI}::{totalSupply()(uint256)}}`,
    );
    expect(assets > 0n).to.be.true;
  }, 30_000);

  it("reads from a nested hop used as a call argument", async () => {
    // Same computation as the case above with the marker moved to the
    // NESTED hop. A nested read is not redundant (it is what lets an
    // argument read from a computed head), so the two must agree.
    const outerMarked = await num(
      `${SDAI}::!{convertToAssets(uint256)(uint256) ${WXDAI}::{totalSupply()(uint256)}}`,
    );
    const nestedMarked = await num(
      `${SDAI}::{convertToAssets(uint256)(uint256) ${WXDAI}::!{totalSupply()(uint256)}}`,
    );
    expect(nestedMarked).to.equal(outerMarked);
  }, 30_000);
});
