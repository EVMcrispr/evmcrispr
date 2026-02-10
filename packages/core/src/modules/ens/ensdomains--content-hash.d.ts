declare module "@ensdomains/content-hash" {
  export function decode(contentHash: string): string;
  export function fromIpfs(ipfsHash: string): string;
  export function fromSkylink(skylink: string): string;
  export function fromSwarm(swarmHash: string): string;
  export function encode(codec: string, value: string): string;
  export function getCodec(hash: string): string;

  export const helpers: {
    cidForWeb(cid: string): string;
    cidV0ToV1Base32(cid: string): string;
  };
}
