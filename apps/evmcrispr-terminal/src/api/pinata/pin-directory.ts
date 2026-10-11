import { pin, type Res } from "./pin";

/**
 * Pin a folder to IPFS as a single directory (one CID). Each part's
 * filename is its path relative to the drop root, including the folder
 * name itself — that's how Pinata reconstructs the directory tree.
 */
const pinDirectory = async (
  files: { file: File; path: string }[],
): Promise<Res> => {
  const body = new FormData();
  for (const { file, path } of files) {
    body.append("file", file, path);
  }
  body.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
  body.append(
    "pinataMetadata",
    JSON.stringify({
      name: "EVMcrispr - uploaded folder",
      keyvalues: {
        type: "evmcrispr/directory",
        version: "0.9",
      },
    }),
  );

  // The returned CID is the root folder itself (Pinata strips the shared
  // folder-name prefix), so each file lives at <cid>/<path minus root>.
  // Nothing here can check a directory's CID against the files sent, so
  // they are not remembered under it: the folder is resolved like anyone
  // else's, verified, from a gateway, and shows what the CID really holds.
  return pin(body);
};

export default pinDirectory;
