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
