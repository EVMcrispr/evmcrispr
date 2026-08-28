import { ErrorException, gunzip, untar } from "@evmcrispr/sdk";
import { W3F_UPLOAD_URL } from "../addresses";
import type { UserArgsSchema } from "./entries";
import { parseUserArgsSchema } from "./entries";
import { proxied } from "./upload";

/** The user-args schema a Web3 Function was published with, read from its
 *  archive in Gelato's function store (the only place a Web3 Function
 *  lives). */
export async function functionUserArgsSchema(
  cid: string,
): Promise<UserArgsSchema> {
  let res: Response;
  try {
    res = await fetch(proxied(`${W3F_UPLOAD_URL}/${cid}`));
  } catch {
    throw new ErrorException(
      `couldn't reach Gelato's function store to read the schema of ${cid}`,
    );
  }
  if (res.status === 503) {
    throw new ErrorException(
      `Gelato's function store is unavailable right now (503), so the schema of ${cid} cannot be read; retry later`,
    );
  }
  if (!res.ok) {
    throw new ErrorException(
      `Gelato's function store has no Web3 Function ${cid} (${res.status})`,
    );
  }
  const files = untar(await gunzip(new Uint8Array(await res.arrayBuffer())));
  const raw = files.get("schema.json");
  if (!raw) {
    throw new ErrorException(`Web3 Function ${cid} ships no schema.json`);
  }
  let json: { userArgs?: Record<string, unknown> };
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new ErrorException(
      `Web3 Function ${cid} has a malformed schema.json`,
    );
  }
  return parseUserArgsSchema(
    Object.entries(json.userArgs ?? {}),
    `schema.json of ${cid}`,
  );
}
