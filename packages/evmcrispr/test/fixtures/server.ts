import type { DefaultBodyType } from 'msw';
import { graphql, rest } from 'msw';
import { setupServer } from 'msw/node';

import { artifacts } from './ipfs-data';
import reposFixture from './subgraph-data/RepoResponse.json';
import organizationFixture from './subgraph-data/OrganizationAppsResponse.json';
import tokenListFixture from './tokenlist/uniswap.json';
import { addressesEqual } from '../../src/utils';
import { IPFS_GATEWAY } from '../../src/IPFSResolver';

const handlers = [
  graphql.query<Record<string, any>, { repoName: string }>(
    'Repos',
    (req, res, ctx) => {
      const repoName = req.variables.repoName;

      const selectedRepo = reposFixture.data.repos.find(
        (r) => r.name === repoName,
      );

      return res(
        ctx.status(200),
        ctx.data({ repos: selectedRepo ? [selectedRepo] : [] }),
      );
    },
  ),
  graphql.query<Record<string, any>, { id: string }>(
    'Organization',
    (req, res, ctx) => {
      const id = req.variables.id;

      const organization = addressesEqual(
        id,
        organizationFixture.data.organization.id,
      )
        ? organizationFixture.data.organization
        : null;

      return res(ctx.status(200), ctx.data({ organization }));
    },
  ),
  rest.get<DefaultBodyType, { cid: string; resource: string }>(
    `${IPFS_GATEWAY}:cid/:resource`,
    (req, res, ctx) => {
      const { cid, resource } = req.params;

      if (resource === 'artifact.json') {
        const artifact = artifacts[cid as keyof typeof artifacts];
        if (!artifact) {
          return res(ctx.status(404));
        }

        return res(ctx.status(200), ctx.json(artifact));
      }
    },
  ),
  rest.get('https://tokens.uniswap.org/', (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(tokenListFixture));
  }),
];

export const server = setupServer(...handlers);
