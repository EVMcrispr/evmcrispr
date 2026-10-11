import {
  ErrorConnection,
  ErrorException,
  ErrorUnexpectedResult,
} from "../errors";
import {
  matchesSingleBlock,
  parseCidString,
  SINGLE_BLOCK_LIMIT,
} from "./verifiedIpfs";

/**
 * Where content is pinned when the caller has no Pinata token of its own:
 * the EVMcrispr API holds one, so none has to ship in a web bundle.
 */
export const IPFS_PIN_URL = "https://api.evmcrispr.com/ipfs/pin";

const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/** Content asked to be pinned as a single block that would not fit one. */
export class ErrorTooLargeToPin extends ErrorException {
  constructor() {
    super(
      "This is too large to pin: a script or module can be 256 KB at most.",
    );
  }
}

export interface PinOptions {
  /** A Pinata token: with one, the pin goes straight to Pinata. */
  jwt?: string;
  /** Another deployment of the pin route (local development, self-hosting). */
  pinUrl?: string;
  /**
   * Refuse content that would not be a single IPFS block (over 256 KiB, or
   * a folder). For scripts and modules: readers fetch those as a plain
   * file and check it against the CID, which only one block allows.
   */
  singleBlock?: boolean;
}

/** The body `pinJSONToIPFS` takes. */
export interface PinJsonBody {
  pinataContent: unknown;
  pinataMetadata?: Record<string, unknown>;
  pinataOptions?: Record<string, unknown>;
}

/**
 * Pin `body` to IPFS and return its CID. `body` is what Pinata takes: the
 * `pinJSONToIPFS` object, or the `pinFileToIPFS` form (one `file` part, or
 * one per file of a directory). The pin route forwards either as it is.
 *
 * The CID comes from a service, and a wrong one would have the caller
 * share or run someone else's content as its own, so it is checked against
 * the bytes that were sent and refused when it is not theirs. That check
 * needs the content to be one block: for a larger file or a directory the
 * CID is returned as the service gave it.
 */
export async function pinToIpfs(
  body: FormData | PinJsonBody,
  { jwt, pinUrl, singleBlock }: PinOptions = {},
): Promise<string> {
  const isForm = body instanceof FormData;
  const sent = await singleBlockContent(body);
  if (singleBlock && !sent) {
    throw new ErrorTooLargeToPin();
  }
  const url = jwt
    ? isForm
      ? PINATA_FILE_URL
      : PINATA_JSON_URL
    : (pinUrl ?? IPFS_PIN_URL);

  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  // A form's type carries a boundary only the runtime knows: leave it unset.
  if (!isForm) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: isForm ? body : JSON.stringify(body),
    });
  } catch (_) {
    throw new ErrorConnection(`Couldn't reach the IPFS pinning service.`);
  }

  const answer = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ErrorConnection(
      `Couldn't pin to IPFS (${response.status}): ${refusal(answer) ?? response.statusText}`,
    );
  }
  const cid = answer?.cid ?? answer?.IpfsHash;
  if (typeof cid !== "string" || !cid) {
    throw new ErrorUnexpectedResult(
      "The IPFS pinning service returned no CID.",
    );
  }
  if (!sent) {
    // Nothing to compare with: the least the answer must be is an address,
    // since callers build links and paths from it.
    try {
      parseCidString(cid);
    } catch (_) {
      throw new ErrorUnexpectedResult(
        `The IPFS pinning service answered with "${cid.slice(0, 64)}", which is not an IPFS address.`,
      );
    }
    return cid;
  }
  if (!(await matchesSingleBlock(cid, sent).catch(() => false))) {
    throw new ErrorUnexpectedResult(
      `The IPFS pinning service answered with an address (${cid.slice(0, 64)}) that does not match the content it was sent.`,
    );
  }
  return cid;
}

/**
 * The bytes the pinning service stores for `body`, when they make a single
 * block whose address can be worked out here: JSON content (stored compact,
 * keys in the order sent), or one file that is not inside a folder.
 */
async function singleBlockContent(
  body: FormData | PinJsonBody,
): Promise<Uint8Array | undefined> {
  let bytes: Uint8Array;
  if (body instanceof FormData) {
    const files = body.getAll("file");
    const [file] = files;
    if (files.length !== 1 || !(file instanceof Blob)) return undefined;
    // A name with a folder in it is pinned as a directory holding the file.
    if (file instanceof File && file.name.includes("/")) return undefined;
    if (file.size > SINGLE_BLOCK_LIMIT) return undefined;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    bytes = new TextEncoder().encode(JSON.stringify(body.pinataContent));
  }
  return bytes.length > SINGLE_BLOCK_LIMIT ? undefined : bytes;
}

/** The reason in an error answer, in the pin route's shape or Pinata's. */
function refusal(answer: any): string | undefined {
  const error = answer?.error;
  if (typeof error === "string") {
    return typeof answer.details === "string"
      ? `${error}: ${answer.details}`
      : error;
  }
  return error?.details ?? error?.reason;
}
