import {
  ErrorException,
  gunzip,
  type Module,
  overlaid,
  untar,
} from "@evmcrispr/sdk";
import { W3F_UPLOAD_URL } from "../addresses";
import type { UserArgsSchema } from "./entries";
import { parseUserArgsSchema } from "./entries";
import { proxied } from "./upload";

/**
 * User-args schemas by CID. `publish-function` records the schema of what
 * it just published in the run's off-chain overlay — inside a simulation
 * that is a placeholder CID nothing was uploaded for, and the overlay is
 * cleared when the `sim:fork` ends; anything else is fetched from Gelato's
 * function store, the only place a Web3 Function tgz lives.
 */
const schemaOverlayKey = (cid: string) => `gelato:function-schema:${cid}`;

export function rememberFunctionSchema(
  module: Module,
  cid: string,
  schema: UserArgsSchema,
) {
  module.offchain.set(schemaOverlayKey(cid), schema);
}

export function functionUserArgsSchema(
  module: Module,
  cid: string,
): Promise<UserArgsSchema> {
  return overlaid(module, schemaOverlayKey(cid), () => fetchSchema(cid));
}

async function fetchSchema(cid: string): Promise<UserArgsSchema> {
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
