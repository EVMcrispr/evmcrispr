import { ErrorConnection, ErrorUnexpectedResult } from './errors';

export const IPFS_GATEWAY = 'https://ipfs.blossom.software/ipfs/'; // "https://gateway.pinata.cloud/ipfs/";

export class IPFSResolver {
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
      return url.replace(/\{path\}/, '');
    }
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    return url.replace(/\{path\}/, path);
  }

  // TODO: maybe this is redundant
  #buildIpfsTemplate(ipfsGateway: string = IPFS_GATEWAY): string {
    let ipfsUrlTemplate = ipfsGateway;

    if (ipfsGateway.charAt(ipfsGateway.length - 1) !== '/') {
      ipfsUrlTemplate += '/';
    }

    return (ipfsUrlTemplate += '{cid}{path}');
  }
}
