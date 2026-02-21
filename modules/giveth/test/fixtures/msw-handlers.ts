import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";

import ipfsQmYYpntQ from "./ipfs-QmYYpntQ.json";
import ipfsQmdERB7M from "./ipfs-QmdERB7M.json";
import ipfsQmUz2rm8 from "./ipfs-QmUz2rm8.json";

const ipfsData: Record<string, unknown> = {
  QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1: ipfsQmYYpntQ,
  QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr: ipfsQmdERB7M,
  QmUz2rm8wDV5ZWNjwehWLEoUoviXwGapgYokmfqEuy4nW9: ipfsQmUz2rm8,
};

export const givethIpfsHandlers = [
  http.get("https://ipfs.blossom.software/ipfs/:hash", ({ params }) => {
    const data = ipfsData[params.hash as string];
    if (!data) return HttpResponse.error();
    return HttpResponse.json(data);
  }),
];
