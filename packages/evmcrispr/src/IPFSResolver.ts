import { ErrorConnection, ErrorUnexpectedResult } from './errors';

export class IPFSResolver {
  #urlTemplate: string;

  constructor(urlTemplate: string) {
    this.#urlTemplate = urlTemplate;
  }

  async json(cid: string, path?: string): Promise<Record<string, any>> {
    const url = await this.url(cid, path);

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

  async url(cid: string, path?: string): Promise<string> {
    const url = this.#urlTemplate.replace(/\{cid\}/, cid);
    if (!path) {
      return url.replace(/\{path\}/, '');
    }
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    return url.replace(/\{path\}/, path);
  }
}
