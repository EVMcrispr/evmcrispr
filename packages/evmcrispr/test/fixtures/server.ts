/* eslint-disable import/no-unresolved */
import type { DefaultBodyType } from 'msw';
import { graphql, rest } from 'msw';
import { setupServer } from 'msw/node';

import { artifacts } from './artifacts/';
import { DAOs, REPOs } from './subgraph-data';
import tokenListFixture from './tokenlist/uniswap.json';
import { IPFS_GATEWAY } from '../../src/IPFSResolver';
import { addressesEqual } from '../../src/utils';

const handlers = [
  graphql.query<Record<string, any>, { repoName: string }>(
    'Repos',
    (req, res, ctx) => {
      const repoName = req.variables.repoName;

      const selectedRepo = REPOs[repoName as keyof typeof REPOs];

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
  rest.get('https://tokens.uniswap.org/', (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(tokenListFixture));
  }),
];

export const server = setupServer(...handlers);
