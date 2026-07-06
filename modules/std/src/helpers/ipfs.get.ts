import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "ipfs.get",
  description: "Fetch content from IPFS and return it as text.",
  returnType: "any",
  args: [
    {
      name: "cid",
      type: "string",
      description: "Content identifier to fetch",
    },
  ],
  async run(module, { cid }) {
    const url = await module.ipfsResolver.url(String(cid));

    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: unknown) {
      throw new ErrorException(
        `@ipfs.get: network error – ${err instanceof Error ? err.message : err}`,
      );
    }

    if (!res.ok) {
      throw new ErrorException(`@ipfs.get: ${res.status} ${res.statusText}`);
    }

    const text = (await res.text()).trim();

    // Content pinned by @ipfs goes through pinJSONToIPFS, so plain text is
    // stored JSON-quoted; unwrap it so @ipfs.get(@ipfs(text)) round-trips.
    if (text.startsWith('"')) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === "string") return parsed;
      } catch {
        // not JSON – fall through to the raw text
      }
    }

    return text;
  },
});
