import { ErrorConnection, ErrorUnexpectedResult } from "../errors";

/**
 * Trustless IPFS fetching: download a CID (optionally `cid/path/inside`) as a
 * CAR archive from an HTTP gateway and verify every consumed block against
 * its multihash before reassembling the file bytes, so a misbehaving gateway
 * cannot substitute content — including for paths inside a directory, where
 * hashing the served file alone would prove nothing about the requested CID.
 *
 * Hand-rolled (varint/base58/base32/dag-pb/UnixFS) rather than depending on
 * helia/multiformats; SHA-256 comes from WebCrypto. Fails closed: anything
 * it cannot verify (unknown hash function, HAMT-sharded directories) is an
 * error, not an unverified pass-through. A gateway that cannot serve CARs
 * at all is retried on {@link TRUSTLESS_GATEWAYS} — never trusted as-is.
 */

const CODEC_RAW = 0x55;
const CODEC_DAG_PB = 0x70;
const HASH_SHA2_256 = 0x12;
const HASH_IDENTITY = 0x00;

// UnixFS Data.Type values
const UNIXFS_RAW = 0;
const UNIXFS_DIRECTORY = 1;
const UNIXFS_FILE = 2;
const UNIXFS_HAMT_SHARD = 5;

interface Cid {
  codec: number;
  hashCode: number;
  digest: Uint8Array;
  /** The CID's binary encoding, kept for re-encoding to a string. */
  bytes: Uint8Array;
  /** Block-map key — blocks are identified by their multihash. */
  key: string;
}

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = offset;
  for (;;) {
    if (i >= bytes.length) {
      throw new ErrorUnexpectedResult("truncated varint in IPFS data");
    }
    const b = bytes[i++];
    value += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) return [value, i];
    shift += 7;
    if (shift > 49) {
      throw new ErrorUnexpectedResult("varint too large in IPFS data");
    }
  }
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) {
      throw new ErrorUnexpectedResult(`invalid base58 character "${ch}"`);
    }
    for (let j = 0; j < bytes.length; j++) {
      const x = bytes[j] * 58 + carry;
      bytes[j] = x & 0xff;
      carry = x >> 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < s.length && s[i] === "1"; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

function base32Decode(s: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx < 0) {
      throw new ErrorUnexpectedResult(`invalid base32 character "${ch}"`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

function hexDecode(s: string): Uint8Array {
  if (s.length % 2 !== 0 || /[^0-9a-f]/.test(s)) {
    throw new ErrorUnexpectedResult("invalid hex CID");
  }
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function makeCid(
  codec: number,
  hashCode: number,
  digest: Uint8Array,
  bytes: Uint8Array,
): Cid {
  return { codec, hashCode, digest, bytes, key: `${hashCode}:${hex(digest)}` };
}

/** Parse a binary CID (as found in CAR sections and dag-pb links). */
function parseCidBytes(bytes: Uint8Array, offset: number): [Cid, number] {
  // CIDv0: bare sha2-256 multihash of a dag-pb block.
  if (bytes[offset] === HASH_SHA2_256 && bytes[offset + 1] === 0x20) {
    const digest = bytes.subarray(offset + 2, offset + 34);
    if (digest.length !== 32) {
      throw new ErrorUnexpectedResult("truncated CIDv0");
    }
    const encoded = bytes.subarray(offset, offset + 34);
    return [makeCid(CODEC_DAG_PB, HASH_SHA2_256, digest, encoded), offset + 34];
  }
  const [version, o1] = readVarint(bytes, offset);
  if (version !== 1) {
    throw new ErrorUnexpectedResult(`unsupported CID version ${version}`);
  }
  const [codec, o2] = readVarint(bytes, o1);
  const [hashCode, o3] = readVarint(bytes, o2);
  const [hashLen, o4] = readVarint(bytes, o3);
  const digest = bytes.subarray(o4, o4 + hashLen);
  if (digest.length !== hashLen) {
    throw new ErrorUnexpectedResult("truncated CID multihash");
  }
  const encoded = bytes.subarray(offset, o4 + hashLen);
  return [makeCid(codec, hashCode, digest, encoded), o4 + hashLen];
}

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = Math.floor(x / 58);
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Encode a CID back to its canonical string form (v0 base58 / v1 base32). */
function cidToString(cid: Cid): string {
  if (cid.bytes[0] === HASH_SHA2_256 && cid.bytes.length === 34) {
    return base58Encode(cid.bytes);
  }
  return `b${base32Encode(cid.bytes)}`;
}

export function parseCidString(cid: string): Cid {
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
    const bytes = base58Decode(cid);
    return parseCidBytes(bytes, 0)[0];
  }
  let bytes: Uint8Array;
  if (cid.startsWith("b")) bytes = base32Decode(cid.slice(1));
  else if (cid.startsWith("z")) bytes = base58Decode(cid.slice(1));
  else if (cid.startsWith("f")) bytes = hexDecode(cid.slice(1));
  else {
    throw new ErrorUnexpectedResult(`"${cid}" is not a supported CID`);
  }
  const [parsed, end] = parseCidBytes(bytes, 0);
  if (end !== bytes.length) {
    throw new ErrorUnexpectedResult(`"${cid}" has trailing CID bytes`);
  }
  return parsed;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer),
  );
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Index a CAR archive's sections by multihash. First occurrence wins. */
function parseCar(car: Uint8Array): Map<string, Uint8Array> {
  const [headerLen, headerStart] = readVarint(car, 0);
  let offset = headerStart + headerLen; // header contents (roots) are unused
  const blocks = new Map<string, Uint8Array>();
  while (offset < car.length) {
    const [sectionLen, dataStart] = readVarint(car, offset);
    const sectionEnd = dataStart + sectionLen;
    if (sectionEnd > car.length) {
      throw new ErrorUnexpectedResult("truncated CAR section");
    }
    const [cid, blockStart] = parseCidBytes(car, dataStart);
    if (!blocks.has(cid.key)) {
      blocks.set(cid.key, car.subarray(blockStart, sectionEnd));
    }
    offset = sectionEnd;
  }
  return blocks;
}

class BlockSource {
  #blocks: Map<string, Uint8Array>;
  #verified = new Set<string>();

  constructor(blocks: Map<string, Uint8Array>) {
    this.#blocks = blocks;
  }

  /** The block behind `cid`, hash-verified before it is returned. */
  async get(cid: Cid): Promise<Uint8Array> {
    if (cid.hashCode === HASH_IDENTITY) return cid.digest;
    if (cid.hashCode !== HASH_SHA2_256) {
      throw new ErrorUnexpectedResult(
        `unsupported hash function 0x${cid.hashCode.toString(16)} — only sha2-256 CIDs can be verified`,
      );
    }
    const data = this.#blocks.get(cid.key);
    if (data === undefined) {
      throw new ErrorUnexpectedResult(
        "the gateway response is missing a required block",
      );
    }
    if (!this.#verified.has(cid.key)) {
      if (!equalBytes(await sha256(data), cid.digest)) {
        throw new ErrorUnexpectedResult(
          "the downloaded content does not match its hash",
        );
      }
      this.#verified.add(cid.key);
    }
    return data;
  }
}

interface PbNode {
  data?: Uint8Array;
  links: { name: string; cid: Cid }[];
}

function decodeDagPb(bytes: Uint8Array): PbNode {
  const node: PbNode = { links: [] };
  let offset = 0;
  while (offset < bytes.length) {
    const [tag, o1] = readVarint(bytes, offset);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire === 0) {
      [, offset] = readVarint(bytes, o1);
      continue;
    }
    if (wire !== 2) {
      throw new ErrorUnexpectedResult("malformed dag-pb block");
    }
    const [len, o2] = readVarint(bytes, o1);
    const value = bytes.subarray(o2, o2 + len);
    if (value.length !== len) {
      throw new ErrorUnexpectedResult("truncated dag-pb block");
    }
    offset = o2 + len;
    if (field === 1) node.data = value;
    else if (field === 2) node.links.push(decodePbLink(value));
  }
  return node;
}

function decodePbLink(bytes: Uint8Array): { name: string; cid: Cid } {
  let name = "";
  let cid: Cid | undefined;
  let offset = 0;
  while (offset < bytes.length) {
    const [tag, o1] = readVarint(bytes, offset);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire === 0) {
      [, offset] = readVarint(bytes, o1);
      continue;
    }
    if (wire !== 2) {
      throw new ErrorUnexpectedResult("malformed dag-pb link");
    }
    const [len, o2] = readVarint(bytes, o1);
    const value = bytes.subarray(o2, o2 + len);
    if (value.length !== len) {
      throw new ErrorUnexpectedResult("truncated dag-pb link");
    }
    offset = o2 + len;
    if (field === 1) [cid] = parseCidBytes(value, 0);
    else if (field === 2) name = new TextDecoder().decode(value);
  }
  if (!cid) throw new ErrorUnexpectedResult("dag-pb link without a hash");
  return { name, cid };
}

function decodeUnixfs(bytes: Uint8Array): {
  type: number;
  data?: Uint8Array;
  filesize?: number;
} {
  let type = UNIXFS_FILE;
  let data: Uint8Array | undefined;
  let filesize: number | undefined;
  let offset = 0;
  while (offset < bytes.length) {
    const [tag, o1] = readVarint(bytes, offset);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire === 0) {
      const [value, o2] = readVarint(bytes, o1);
      offset = o2;
      if (field === 1) type = value;
      else if (field === 3) filesize = value;
    } else if (wire === 2) {
      const [len, o2] = readVarint(bytes, o1);
      const value = bytes.subarray(o2, o2 + len);
      if (value.length !== len) {
        throw new ErrorUnexpectedResult("truncated UnixFS metadata");
      }
      offset = o2 + len;
      if (field === 2) data = value;
    } else {
      throw new ErrorUnexpectedResult("malformed UnixFS metadata");
    }
  }
  return { type, data, filesize };
}

/** Walk `segments` from `cid` through UnixFS directories. */
async function resolvePath(
  source: BlockSource,
  cid: Cid,
  segments: string[],
): Promise<Cid> {
  for (const segment of segments) {
    if (cid.codec !== CODEC_DAG_PB) {
      throw new ErrorUnexpectedResult(
        `cannot resolve "${segment}": parent is not a directory`,
      );
    }
    const node = decodeDagPb(await source.get(cid));
    const fs = node.data ? decodeUnixfs(node.data) : undefined;
    if (fs?.type === UNIXFS_HAMT_SHARD) {
      throw new ErrorUnexpectedResult(
        "HAMT-sharded directories are not supported",
      );
    }
    if (fs && fs.type !== UNIXFS_DIRECTORY) {
      throw new ErrorUnexpectedResult(
        `cannot resolve "${segment}": parent is not a directory`,
      );
    }
    const link = node.links.find((l) => l.name === segment);
    if (!link) {
      throw new ErrorUnexpectedResult(
        `"${segment}" not found in the directory`,
      );
    }
    cid = link.cid;
  }
  return cid;
}

/**
 * Byte budget for partial (`entity-bytes`) fetches: assembly stops once
 * `left` runs out, and `truncated` records that content was cut off.
 */
interface ByteBudget {
  left: number;
  truncated: boolean;
}

function pushLimited(
  out: Uint8Array[],
  bytes: Uint8Array,
  budget?: ByteBudget,
): void {
  if (!budget) {
    out.push(bytes);
    return;
  }
  const take = Math.min(bytes.length, budget.left);
  if (take < bytes.length) budget.truncated = true;
  if (take > 0) out.push(bytes.subarray(0, take));
  budget.left -= take;
}

/** Reassemble a UnixFS file (raw leaf, inline data, or chunked) into `out`. */
async function assembleFile(
  source: BlockSource,
  cid: Cid,
  out: Uint8Array[],
  budget?: ByteBudget,
): Promise<void> {
  if (budget && budget.left <= 0) {
    budget.truncated = true;
    return;
  }
  const block = await source.get(cid);
  if (cid.codec === CODEC_RAW) {
    pushLimited(out, block, budget);
    return;
  }
  if (cid.codec !== CODEC_DAG_PB) {
    throw new ErrorUnexpectedResult(
      `unsupported codec 0x${cid.codec.toString(16)}`,
    );
  }
  const node = decodeDagPb(block);
  const fs = node.data ? decodeUnixfs(node.data) : { type: UNIXFS_FILE };
  if (fs.type === UNIXFS_DIRECTORY || fs.type === UNIXFS_HAMT_SHARD) {
    throw new ErrorUnexpectedResult(
      "the CID resolves to a directory, not a file",
    );
  }
  if (fs.type !== UNIXFS_FILE && fs.type !== UNIXFS_RAW) {
    throw new ErrorUnexpectedResult(`unsupported UnixFS node type ${fs.type}`);
  }
  if (fs.data?.length) pushLimited(out, fs.data, budget);
  for (const link of node.links) {
    if (budget && budget.left <= 0) {
      budget.truncated = true;
      break;
    }
    await assembleFile(source, link.cid, out, budget);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface VerifiedFetchOptions {
  /**
   * Fetch only the first `maxBytes` of a file (via the gateway's
   * `entity-bytes` parameter). Directories always return their full listing.
   */
  maxBytes?: number;
  signal?: AbortSignal;
}

export type IpfsEntity =
  | {
      kind: "file";
      bytes: Uint8Array;
      /** Total file size when known (UnixFS filesize / raw block length). */
      size?: number;
      /** False when `maxBytes` cut the content short. */
      complete: boolean;
    }
  | { kind: "directory"; entries: { name: string; cid: string }[] };

/**
 * Gateways tried when the requested one can't serve the CAR: plenty of
 * gateways (including ours) only speak plain HTTP paths, and a link must
 * still open. Ordered by how reliably they implement the trustless spec.
 */
export const TRUSTLESS_GATEWAYS = [
  "https://trustless-gateway.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://dweb.link/ipfs/",
];

/** Download `cidPath` as a CAR, or throw if this gateway can't serve one. */
async function fetchCar(
  cidPath: string,
  gatewayBase: string,
  opts: VerifiedFetchOptions,
): Promise<Uint8Array> {
  const [cidStr, ...segments] = cidPath.split("/").filter(Boolean);
  const range =
    opts.maxBytes !== undefined
      ? `entity-bytes=0:${Math.max(0, opts.maxBytes - 1)}`
      : "dag-scope=entity";
  const url = `${gatewayBase}${cidStr}${segments
    .map((s) => `/${encodeURIComponent(s)}`)
    .join("")}?format=car&${range}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/vnd.ipld.car" },
      signal: opts.signal,
    });
  } catch (_) {
    throw new ErrorConnection(`Couldn't fetch ${url}.`);
  }
  if (!response.ok) {
    throw new ErrorConnection(
      `Couldn't fetch ${url} (${response.status} ${response.statusText}).`,
    );
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("vnd.ipld.car")) {
    throw new ErrorUnexpectedResult(
      `${url} did not return a verifiable (CAR) response — the IPFS gateway must support the trustless gateway spec`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchVerifiedTarget(
  cidPath: string,
  gatewayBase: string,
  opts: VerifiedFetchOptions,
): Promise<{ source: BlockSource; target: Cid }> {
  const [cidStr, ...segments] = cidPath.split("/").filter(Boolean);
  const rootCid = parseCidString(cidStr);

  const gateways = [
    gatewayBase,
    ...TRUSTLESS_GATEWAYS.filter((g) => g !== gatewayBase),
  ];
  let car: Uint8Array | undefined;
  let lastError: unknown;
  for (const gateway of gateways) {
    try {
      car = await fetchCar(cidPath, gateway, opts);
      break;
    } catch (err) {
      // Only transport/format failures fall through to the next gateway —
      // a CAR that fails verification is reported, never papered over.
      if (opts.signal?.aborted) throw err;
      lastError = err;
    }
  }
  if (!car) throw lastError;

  const source = new BlockSource(parseCar(car));
  const target = await resolvePath(source, rootCid, segments);
  return { source, target };
}

function labelVerificationError(cidPath: string, err: unknown): never {
  if (err instanceof ErrorUnexpectedResult) {
    throw new ErrorUnexpectedResult(
      `IPFS verification failed for ${cidPath}: ${err.message}`,
    );
  }
  throw err;
}

/**
 * Fetch `cidPath` ("<cid>" or "<cid>/name/inside") through `gatewayBase`
 * (ending in "/ipfs/") as a CAR archive and return the verified file bytes.
 */
export async function verifiedIpfsFetch(
  cidPath: string,
  gatewayBase: string,
  opts: Pick<VerifiedFetchOptions, "signal"> = {},
): Promise<Uint8Array> {
  try {
    const { source, target } = await fetchVerifiedTarget(cidPath, gatewayBase, {
      signal: opts.signal,
    });
    const chunks: Uint8Array[] = [];
    await assembleFile(source, target, chunks);
    return concat(chunks);
  } catch (err) {
    labelVerificationError(cidPath, err);
  }
}

/**
 * Like {@link verifiedIpfsFetch}, but distinguishes files from directories
 * instead of failing on the latter, and supports fetching only a verified
 * head of a file (`maxBytes`) — what previews need.
 */
export async function verifiedIpfsEntity(
  cidPath: string,
  gatewayBase: string,
  opts: VerifiedFetchOptions = {},
): Promise<IpfsEntity> {
  try {
    const { source, target } = await fetchVerifiedTarget(
      cidPath,
      gatewayBase,
      opts,
    );
    const block = await source.get(target);
    if (target.codec === CODEC_RAW) {
      return { kind: "file", bytes: block, size: block.length, complete: true };
    }
    if (target.codec !== CODEC_DAG_PB) {
      throw new ErrorUnexpectedResult(
        `unsupported codec 0x${target.codec.toString(16)}`,
      );
    }
    const node = decodeDagPb(block);
    const fs = node.data ? decodeUnixfs(node.data) : { type: UNIXFS_FILE };
    if (fs.type === UNIXFS_HAMT_SHARD) {
      throw new ErrorUnexpectedResult(
        "HAMT-sharded directories are not supported",
      );
    }
    if (fs.type === UNIXFS_DIRECTORY) {
      return {
        kind: "directory",
        entries: node.links.map((l) => ({
          name: l.name,
          cid: cidToString(l.cid),
        })),
      };
    }
    const budget =
      opts.maxBytes !== undefined
        ? { left: opts.maxBytes, truncated: false }
        : undefined;
    const chunks: Uint8Array[] = [];
    await assembleFile(source, target, chunks, budget);
    const bytes = concat(chunks);
    const size =
      "filesize" in fs && fs.filesize !== undefined
        ? fs.filesize
        : node.links.length === 0
          ? bytes.length
          : undefined;
    return { kind: "file", bytes, size, complete: !budget?.truncated };
  } catch (err) {
    labelVerificationError(cidPath, err);
  }
}
