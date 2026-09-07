import "../setup";
import { beforeAll, describe, it } from "bun:test";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installMockTarget,
  MOCK_TARGET_ADDRESS,
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

/** The contracts repo's fixture: `join3`/`join6` take three and six
 *  dynamic arguments, `callerGated` two behind a word and reverts unless
 *  the caller is the address it is handed. */
const MOCK = MOCK_TARGET_ADDRESS;
/** MockTarget.strings(): a sub-word element and one crossing a word
 *  boundary, so a wrong payload size shows up as garbage rather than as
 *  padding that happens to work. */
const SHORT = "ab";
const LONG = "a value with more than thirty-two bytes";
/** One live string argument: an element of that array, resolved at judge
 *  time, optionally cut to `n` bytes. */
const live = (index: 0 | 1, n?: number): string => {
  const element = `@at!(${MOCK}::{strings()(string[])} ${index})`;
  return n === undefined ? element : `@str.slice!(${element} 0 ${n})`;
};

let CORE: Address;
let OPERATIONS: Address;
let COLLECTIONS: Address;

async function read(expression: string, module?: string): Promise<Norm> {
  const { operand } = await compileExpression(expression, {
    core: CORE,
    operators: OPERATIONS,
    collections: COLLECTIONS,
    module,
  });
  return resolveValue(getPublicClient(), operand, { core: CORE });
}

/** Every shape here resolves to a single word. */
async function num(expression: string, module?: string): Promise<bigint> {
  const value = await read(expression, module);
  if (value.t !== "num") {
    throw new Error(`expected a number from ${expression}, got ${value.t}`);
  }
  return BigInt(value.v.toString());
}

/** Every shape here that resolves to a string goes through the lang
 *  helpers, so the module is loaded for it. */
async function str(expression: string): Promise<string> {
  const value = await read(expression, "lang");
  if (value.t !== "str") {
    throw new Error(`expected a string from ${expression}, got ${value.t}`);
  }
  return value.v;
}

describe("std > ::! read hops (resolved)", () => {
  beforeAll(async () => {
    ({
      core: CORE,
      operators: OPERATIONS,
      collections: COLLECTIONS,
    } = await installAssertionsCore(getPublicClient()));
    await installMockTarget(getPublicClient());
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

  // Several dynamic arguments in one constructed call. The splice layout
  // can only place one runtime-sized live (every later offset would have
  // to be computed from its length, re-resolving it), so these compile to
  // the core's `get`, which resolves each whole value once in its own
  // frame. Executing them is what proves the tuple the core encodes is
  // the one the destination decodes.
  it("constructs a call with two live dynamic arguments", async () => {
    expect(
      await str(
        `${MOCK}::!{join3(string,string,string)(string) ${live(0)} "-" ${live(1)}}`,
      ),
    ).to.equal(`${SHORT}-${LONG}`);
  }, 30_000);

  it("constructs a call with three live dynamic arguments", async () => {
    expect(
      await str(
        `${MOCK}::!{join3(string,string,string)(string) ${live(0)} ${live(1)} ${live(1, 5)}}`,
      ),
    ).to.equal(SHORT + LONG + LONG.slice(0, 5));
  }, 30_000);

  it("constructs a call with six live dynamic arguments", async () => {
    const sizes = [1, 2, 3, 5, 8, 13];
    expect(
      await str(
        `${MOCK}::!{join6(string,string,string,string,string,string)(string) ${sizes
          .map((n) => live(1, n))
          .join(" ")}}`,
      ),
    ).to.equal(sizes.map((n) => LONG.slice(0, n)).join(""));
  }, 30_000);

  it("keeps the core as msg.sender at the destination", async () => {
    // callerGated reverts Unauthorized unless msg.sender is the address it
    // is handed, so resolving to the two payload lengths proves the core
    // made the call — the property a resolve-once host on another
    // contract would silently have broken.
    expect(
      await num(
        `${MOCK}::!{callerGated(address,string,string)(uint256) ${CORE} ${live(0)} ${live(1)}}`,
        "lang",
      ),
    ).to.equal(BigInt(SHORT.length + LONG.length));
  }, 30_000);
});
