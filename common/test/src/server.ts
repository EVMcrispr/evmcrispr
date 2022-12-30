import { utils } from 'ethers';
import type { DefaultBodyType, PathParams, RequestHandler } from 'msw';
import { graphql, rest } from 'msw';
import { setupServer } from 'msw/node';

import { artifacts } from './fixtures/artifacts';
import { blockscout } from './fixtures/blockscout';
import { etherscan } from './fixtures/etherscan';
import { DAOs, REPOs } from './fixtures/subgraph-data';
import tokenListFixture from './fixtures/tokenlist/uniswap.json';

const PINATA_AUTH = `Bearer ${process.env.VITE_PINATA_JWT}`;

// TODO: allow to input custom ipfs gateway instead of hard-coding it
const IPFS_GATEWAY = 'https://ipfs.blossom.software/ipfs/';

function addressesEqual(first: string, second: string): boolean {
  first = first && first.toLowerCase();
  second = second && second.toLowerCase();
  return first === second;
}

const handlers: RequestHandler[] = [
  graphql.query<Record<string, any>, { repoName: string }>(
    'Repos',
    (req, res, ctx) => {
      const selectedRepo = REPOs[
        req.variables.repoName as keyof typeof REPOs
      ] as any;

      return res(
        ctx.status(200),
        ctx.data({
          repos: selectedRepo ? selectedRepo.data.repos : [],
        }),
      );
    },
  ),
  graphql.query<Record<string, any>, { id: string }>(
    'Organization',
    (req, res, ctx) => {
      const id = req.variables.id;

      const daoAddresses = Object.keys(DAOs);
      const dao =
        DAOs[
          daoAddresses.find((addr) =>
            addressesEqual(addr, id),
          ) as keyof typeof DAOs
        ];

      return res(
        ctx.status(200),
        ctx.data({
          organization: dao ? dao.data.organization : null,
        }),
      );
    },
  ),
  rest.get<DefaultBodyType, { cid: string; resource: string }>(
    `${IPFS_GATEWAY}:cid/:resource`,
    (req, res, ctx) => {
      const { cid, resource } = req.params;

      console.log(`PAULO: fetching resource ${cid}/${resource}`);
      try {
        if (resource === 'artifact.json') {
          const artifact = artifacts[cid as keyof typeof artifacts];

          if (!artifact) {
            return res(ctx.status(404));
          }

          return res(ctx.status(200), ctx.json(artifact));
        }
      } catch (err) {
        console.log(err);
      }
    },
  ),
  rest.get<DefaultBodyType, { address: string }>(
    `https://api-rinkeby.etherscan.io/api`,
    (req, res, ctx) => {
      const address = req.url.searchParams.get('address');

      if (!address || !utils.isAddress(address)) {
        return res(
          ctx.status(200),
          ctx.json({
            status: '0',
            message: 'NOTOK',
            result: 'Invalid Address format',
          }),
        );
      }

      const data = etherscan[address.toLowerCase() as keyof typeof etherscan];

      if (!data) {
        return res(
          ctx.status(200),
          ctx.json({
            status: '0',
            message: 'NOTOK',
            result: 'Contract source code not verified',
          }),
        );
      }

      return res(ctx.status(200), ctx.json(data));
    },
  ),
  rest.get<DefaultBodyType>(
    `https://blockscout.com/xdai/mainnet/api`,
    (req, res, ctx) => {
      const address = req.url.searchParams.get('address');

      if (!address || !utils.isAddress(address)) {
        return res(
          ctx.status(200),
          ctx.json({
            status: '0',
            message: 'NOTOK',
            result: 'Invalid Address format',
          }),
        );
      }

      const data = blockscout[address.toLowerCase() as keyof typeof blockscout];

      if (!data) {
        return res(
          ctx.status(200),
          ctx.json({
            status: '0',
            message: 'NOTOK',
            result: 'Contract source code not verified',
          }),
        );
      }

      return res(ctx.status(200), ctx.json(data));
    },
  ),
  rest.get('https://tokens.uniswap.org/', (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(tokenListFixture));
  }),
  rest.post<
    {
      pinataOptions: { cidVersion: number };
      pinataMetadata: { name: string };
      pinataContent: string;
    },
    PathParams<string>,
    { IpfsHash?: string; error?: { reason: string; details: string } }
  >('https://api.pinata.cloud/pinning/pinJSONToIPFS', (req, res, ctx) => {
    const auth = req.headers.get('authorization');

    if (!auth || auth !== PINATA_AUTH) {
      return res(
        ctx.status(200),
        ctx.json({
          error: {
            reason: 'INVALID_CREDENTIALS',
            details: 'Invalid/expired credentials',
          },
        }),
      );
    }

    const content = req.body.pinataContent as keyof typeof contentToCid;

    const contentToCid = {
      'This should be pinned in IPFS':
        'QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns',
    };

    return res(
      ctx.status(200),
      ctx.json({
        IpfsHash: contentToCid[content] ?? '',
      }),
    );
  }),
];

export const server = setupServer(...handlers);
