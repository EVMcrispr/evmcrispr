import type { Address, Hex, PublicClient } from "viem";

/**
 * Runtime bytecode that returns `data` verbatim for any call.
 *
 * Some on-chain faces only accept live data — `wordsArg` takes a `::` call or
 * a nested `!` face, never a constant array — so testing them needs a contract
 * that RETURNS the array, not a literal. When no such contract exists on the
 * fork, this stands in.
 *
 * The mock is deliberately the dumbest thing that can work: it ignores the
 * selector and its arguments and returns one fixed blob. That keeps the test
 * about the face under test rather than about the mock — the alternative,
 * mocking real contract behaviour, ends up pinning the mock.
 *
 *   PUSH2 len; PUSH2 off; PUSH1 0; CODECOPY; PUSH2 len; PUSH1 0; RETURN; <data>
 *
 * CODECOPY pops destOffset, offset, length (top first) and RETURN pops
 * offset, length, which is why each is pushed in reverse.
 */
export function constantReturnCode(data: Hex): Hex {
  const body = data.slice(2);
  if (body.length % 2 !== 0) throw new Error("data must be whole bytes");
  const len = body.length / 2;
  const PREFIX_BYTES = 15;
  const hex4 = (n: number) => n.toString(16).padStart(4, "0");
  return `0x61${hex4(len)}61${hex4(PREFIX_BYTES)}600039${`61${hex4(len)}`}6000f3${body}`;
}

/** ABI-encode a `bytes32[]` return: head offset, length, then the elements. */
export function encodeBytes32ArrayReturn(values: readonly Hex[]): Hex {
  const word = (n: bigint) => n.toString(16).padStart(64, "0");
  return `0x${word(32n)}${word(BigInt(values.length))}${values
    .map((v) => v.slice(2).padStart(64, "0"))
    .join("")}`;
}

/** Install a constant-returning mock at `address`. Idempotent. */
export async function installConstantMock(
  client: PublicClient,
  address: Address,
  data: Hex,
): Promise<void> {
  const code = constantReturnCode(data);
  if ((await client.getCode({ address })) === code) return;
  await client.request({
    method: "anvil_setCode",
    params: [address, code],
  } as never);
}

/**
 * Runtime bytecode dispatching on the selector: a different blob per entry,
 * revert on anything unlisted.
 *
 * The constant mock above cannot serve a helper whose two faces call
 * DIFFERENT functions — `@safe:isOwner` scans `getOwners()` off-chain and
 * calls `isOwner()` on-chain — because each face would be handed bytes meant
 * for the other. Dispatching lets the mock answer both consistently, which is
 * the only way those helpers can be compared at all.
 *
 * Assembled in two passes, because a jump target depends on the size of the
 * whole table before it:
 *
 *   PUSH1 0 CALLDATALOAD PUSH1 0xE0 SHR       ; selector            6 bytes
 *   (DUP1 PUSH4 sel EQ PUSH2 dest JUMPI)*     ; table              11 each
 *   PUSH1 0 DUP1 REVERT                       ; no match            4 bytes
 *   (JUMPDEST POP PUSH2 len PUSH2 off
 *    PUSH1 0 CODECOPY PUSH2 len PUSH1 0 RETURN)*                   17 each
 *   <blobs>
 */
export function selectorReturnCode(
  entries: readonly { selector: Hex; data: Hex }[],
): Hex {
  const HEADER = 6;
  const CHECK = 11;
  const BLOCK = 17;
  const NO_MATCH = 4;
  const w = (n: number) => n.toString(16).padStart(4, "0");
  const bytesOf = (h: Hex) => (h.length - 2) / 2;

  const tableEnd = HEADER + entries.length * CHECK + NO_MATCH;
  const blocksEnd = tableEnd + entries.length * BLOCK;

  const dataAt: number[] = [];
  let cursor = blocksEnd;
  for (const e of entries) {
    dataAt.push(cursor);
    cursor += bytesOf(e.data);
  }

  // PUSH1 0; CALLDATALOAD; PUSH1 0xE0; SHR
  let code = "60003560e01c";
  entries.forEach((e, i) => {
    // DUP1; PUSH4 selector; EQ; PUSH2 dest; JUMPI
    code += `8063${e.selector.slice(2)}1461${w(tableEnd + i * BLOCK)}57`;
  });
  // PUSH1 0; DUP1; REVERT
  code += "600080fd";
  entries.forEach((e, i) => {
    const len = w(bytesOf(e.data));
    // JUMPDEST; POP; PUSH2 len; PUSH2 off; PUSH1 0; CODECOPY;
    // PUSH2 len; PUSH1 0; RETURN
    code += `5b5061${len}61${w(dataAt[i]!)}60003961${len}6000f3`;
  });
  for (const e of entries) code += e.data.slice(2);
  return `0x${code}`;
}

/** Install a selector-dispatching mock at `address`. Idempotent. */
export async function installSelectorMock(
  client: PublicClient,
  address: Address,
  entries: readonly { selector: Hex; data: Hex }[],
): Promise<void> {
  const code = selectorReturnCode(entries);
  if ((await client.getCode({ address })) === code) return;
  await client.request({
    method: "anvil_setCode",
    params: [address, code],
  } as never);
}
