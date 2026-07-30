import { gzipSync } from "bun";
import { HttpResponse, http } from "./server";

/**
 * MSW handlers impersonating the npm registry for a fake package: version
 * metadata (with a real sha512 integrity), the tarball itself and the
 * `latest` dist-tag. Content is packed into a genuine gzipped tarball so
 * the sdk's verified npm fetch exercises its actual verification path.
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
  write("00000000000\0", 136); // mtime
  header[156] = "0".charCodeAt(0); // regular file
  write("ustar\0", 257);
  write("00", 263);
  // Checksum is computed with the checksum field itself filled with spaces.
  write("        ", 148);
  const sum = header.reduce((a, b) => a + b, 0);
  write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return header;
}

export function buildTarball(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [path, content] of Object.entries(files)) {
    const data = encoder.encode(content);
    parts.push(tarHeader(`package/${path}`, data.length));
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    parts.push(padded);
  }
  parts.push(new Uint8Array(1024)); // end-of-archive
  const tar = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    tar.set(part, offset);
    offset += part.length;
  }
  return gzipSync(tar);
}

export async function sha512Base64(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-512", bytes as unknown as ArrayBuffer),
  );
  let bin = "";
  for (const b of digest) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function npmPackageHandlers(
  name: string,
  version: string,
  files: Record<string, string>,
  opts: { latest?: string; tamperTarball?: boolean } = {},
) {
  const tgz = buildTarball(files);
  const encoded = name.replace("/", "%2f");
  const tarballUrl = `https://registry.npmjs.org/${name}/-/${name.split("/").pop()}-${version}.tgz`;

  return [
    http.get(
      `https://registry.npmjs.org/${encoded}/${version}`,
      async () =>
        HttpResponse.json({
          name,
          version,
          dist: {
            integrity: `sha512-${await sha512Base64(tgz)}`,
            tarball: tarballUrl,
          },
        }),
      { once: false },
    ),
    http.get(tarballUrl, () => {
      let body = tgz;
      if (opts.tamperTarball) {
        body = new Uint8Array(tgz);
        body[body.length - 1] ^= 0xff;
      }
      return new HttpResponse(body, {
        headers: { "Content-Type": "application/octet-stream" },
      });
    }),
    http.get(`https://registry.npmjs.org/${encoded}/latest`, () =>
      HttpResponse.json({ name, version: opts.latest ?? version }),
    ),
  ];
}
