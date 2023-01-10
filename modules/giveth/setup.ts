import { runSetup } from '@1hive/evmcrispr-test-common/setups/file';
import { graphql } from 'msw';

type Project = {
  id: string;
  addresses: { address: string; networkId: number }[];
};

const PROJECTS: Record<string, Project> = {
  evmcrispr: {
    id: '1350',
    addresses: [
      { address: '0xeafFF6dB1965886348657E79195EB6f1A84657eB', networkId: 1 },
      { address: '0xeafFF6dB1965886348657E79195EB6f1A84657eB', networkId: 100 },
    ],
  },
};

const givethGraphqlHandlers = [
  graphql.query<Record<string, any>, { slug: string }>(
    'GetLearnWithJasonEpisodes',
    (req, res, ctx) => {
      const slug = req.variables.slug;

      const selectdProject = PROJECTS[slug];

      return res(
        ctx.status(200),
        ctx.data({
          projectBySlug: selectdProject ?? null,
        }),
      );
    },
  ),
];

runSetup({
  customServerHandlers: givethGraphqlHandlers,
  chainManagerPort: 8002,
});
