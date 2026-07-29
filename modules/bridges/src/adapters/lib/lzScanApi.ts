import type { Hex } from "viem";
import { LZ_SCAN_API } from "../../addresses";

/** Client for the LayerZero Scan message-status API. */
export async function fetchLzMessageStatus(
  txHash: Hex,
): Promise<string | undefined> {
  const res = await fetch(`${LZ_SCAN_API}/messages/tx/${txHash}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as {
    data?: { status?: { name?: string } }[];
  };
  return body.data?.[0]?.status?.name;
}
