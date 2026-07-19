import { ErrorConnection, ErrorUnexpectedResult } from "./errors";

export const IPFS_GATEWAY = "https://ipfs.blossom.software/ipfs/"; // "https://gateway.pinata.cloud/ipfs/";

export class IPFSResolver {
  /** Successful text fetches keyed by cid — CIDs are immutable, so entries
   *  never expire. Failures are not cached. */
  #textCache = new Map<string, string>();

  /** Fetch a CID's raw text content (used for EVML module files). */
  async text(cid: string, ipfsGateway?: string): Promise<string> {
    const cached = this.#textCache.get(cid);
    if (cached !== undefined) return cached;

    const url = await this.url(cid, undefined, ipfsGateway);
    let response: Response;
    try {
      response = await fetch(url);
    } catch (_) {
      throw new ErrorConnection(`Couldn't fetch ${url}.`);
    }
    if (!response.ok) {
      throw new ErrorConnection(
        `Couldn't fetch ${url} (${response.status} ${response.statusText}).`,
      );
    }
    const text = await response.text();
    this.#textCache.set(cid, text);
    return text;
  }

  async json(
    cid: string,
    path?: string,
    ipfsGateway?: string,
  ): Promise<Record<string, any>> {
    const url = await this.url(cid, path, ipfsGateway);

    const fetchJson = async () => {
      let response;
      let data;

      try {
        response = await fetch(url);
      } catch (_) {
        throw new ErrorConnection(`Couldn't fetch ${url}.`);
      }

      try {
        data = await response.json();
      } catch (_) {
        throw new ErrorUnexpectedResult(
          `Couldn't parse the result of ${url} as JSON.`,
        );
      }

      return data;
    };

    return fetchJson();
  }

  async url(cid: string, path?: string, ipfsGateway?: string): Promise<string> {
    const url = this.#buildIpfsTemplate(ipfsGateway).replace(/\{cid\}/, cid);
    if (!path) {
      return url.replace(/\{path\}/, "");
    }
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    return url.replace(/\{path\}/, path);
  }

  // TODO: maybe this is redundant
  #buildIpfsTemplate(ipfsGateway: string = IPFS_GATEWAY): string {
    let ipfsUrlTemplate = ipfsGateway;

    if (ipfsGateway.charAt(ipfsGateway.length - 1) !== "/") {
      ipfsUrlTemplate += "/";
    }

    return (ipfsUrlTemplate += "{cid}{path}");
  }
}
