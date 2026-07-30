import { ErrorConnection, ErrorUnexpectedResult } from "./errors";
import { verifiedIpfsFetch } from "./utils/verifiedIpfs";

export const IPFS_GATEWAY = "https://ipfs.blossom.software/ipfs/"; // "https://gateway.pinata.cloud/ipfs/";

export class IPFSResolver {
  /**
   * Escape hatch for gateways without trustless (CAR) support: when true,
   * content is fetched as-is and NOT verified against the CID. Test suites
   * turn it on (via the bun preload) so MSW fixtures can serve plain text
   * under made-up CIDs.
   */
  static trustGateway =
    typeof process !== "undefined" &&
    process.env?.EVMCRISPR_TRUST_IPFS_GATEWAY === "true";

  /** Successful text fetches keyed by cid path — CIDs are immutable, so
   *  entries never expire. Failures are not cached. */
  #textCache = new Map<string, string>();

  /**
   * Fetch the raw bytes behind `cidPath` ("<cid>" or "<cid>/file/inside"),
   * verified against the CID so a misbehaving gateway can't substitute
   * content.
   */
  async bytes(cidPath: string, ipfsGateway?: string): Promise<Uint8Array> {
    if (IPFSResolver.trustGateway) {
      const response = await this.#fetch(
        await this.url(cidPath, undefined, ipfsGateway),
      );
      return new Uint8Array(await response.arrayBuffer());
    }
    return verifiedIpfsFetch(cidPath, this.#gatewayBase(ipfsGateway));
  }

  /** Fetch a CID's verified content as text (used for EVML module files). */
  async text(cidPath: string, ipfsGateway?: string): Promise<string> {
    const cached = this.#textCache.get(cidPath);
    if (cached !== undefined) return cached;

    const text = new TextDecoder().decode(
      await this.bytes(cidPath, ipfsGateway),
    );
    this.#textCache.set(cidPath, text);
    return text;
  }

  async json(
    cid: string,
    path?: string,
    ipfsGateway?: string,
  ): Promise<Record<string, any>> {
    const cidPath = path ? `${cid}/${path.replace(/^\//, "")}` : cid;
    const text = await this.text(cidPath, ipfsGateway);
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new ErrorUnexpectedResult(
        `Couldn't parse the content of ${cidPath} as JSON.`,
      );
    }
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

  async #fetch(url: string): Promise<Response> {
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
    return response;
  }

  #gatewayBase(ipfsGateway: string = IPFS_GATEWAY): string {
    return ipfsGateway.endsWith("/") ? ipfsGateway : `${ipfsGateway}/`;
  }

  #buildIpfsTemplate(ipfsGateway?: string): string {
    return `${this.#gatewayBase(ipfsGateway)}{cid}{path}`;
  }
}
