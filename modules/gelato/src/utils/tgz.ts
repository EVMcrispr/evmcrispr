/**
 * Pack `web3Function/{index.js,source.js,schema.json}` into the gzipped
 * ustar archive Gelato's function store expects (the layout `w3f deploy`
 * produces with tar's portable/noMtime flags).
 */

function tarHeader(name: string, size: number): Uint8Array {
  const header = new Uint8Array(512);
  const write = (s: string, offset: number) => {
    for (let i = 0; i < s.length; i++) header[offset + i] = s.charCodeAt(i);
  };
  write(name, 0);
  write("0000644\0", 100); // mode
  write("0000000\0", 108); // uid
  write("0000000\0", 116); // gid
  write(`${size.toString(8).padStart(11, "0")}\0`, 124);
  write("00000000000\0", 136); // mtime: 0, for reproducible archives
  header[156] = "0".charCodeAt(0); // regular file
  write("ustar\0", 257);
  write("00", 263);
  write("        ", 148); // checksum field counts as spaces while summing
  const sum = header.reduce((a, b) => a + b, 0);
  write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return header;
}

/** A gzipped tar of `files` (path → content), paths as given. */
export async function packTgz(
  files: Record<string, string>,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [path, content] of Object.entries(files)) {
    const data = encoder.encode(content);
    parts.push(tarHeader(path, data.length));
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    parts.push(padded);
  }
  parts.push(new Uint8Array(1024)); // end-of-archive marker
  const total = parts.reduce((n, p) => n + p.length, 0);
  const tar = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    tar.set(p, offset);
    offset += p.length;
  }
  const stream = new Blob([tar as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface Web3FunctionSchema {
  web3FunctionVersion: string;
  runtime: string;
  memory: number;
  timeout: number;
  userArgs: Record<string, string>;
}

/** The archive Gelato's function store takes. */
export function packWeb3Function(files: {
  indexJs: string;
  sourceJs: string;
  schema: Web3FunctionSchema;
}): Promise<Uint8Array> {
  return packTgz({
    "web3Function/index.js": files.indexJs,
    "web3Function/source.js": files.sourceJs,
    "web3Function/schema.json": JSON.stringify(files.schema, null, 2),
  });
}

/** Gelato's function store refuses archives above 1 MiB (its download cap). */
export const MAX_BUNDLE_BYTES = 1024 * 1024;
