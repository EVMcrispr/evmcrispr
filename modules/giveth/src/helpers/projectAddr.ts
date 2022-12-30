import { ComparisonType, checkArgsLength } from '@1hive/evmcrispr';
import type { HelperFunction, Module } from '@1hive/evmcrispr';
import fetch from 'isomorphic-fetch';

import type { Giveth } from '../Giveth';

export const _projectAddr = async (
  module: Module,
  slug: string,
): Promise<[string, number]> => {
  const chainId = await module.getChainId();
  const result = await fetch('https://mainnet.serve.giveth.io/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query GetLearnWithJasonEpisodes($slug: String!) {
          projectBySlug(slug: $slug) {
            id
            addresses {
              address
              networkId
            }
          }
        }
        `,
      variables: {
        slug,
      },
    }),
  })
    .then((res) => res.json())
    .then((res) => [
      res.data.projectBySlug.addresses.find((x: any) => x.networkId === chainId)
        ?.address,
      Number(res.data.projectBySlug.id),
    ]);
  return result as [string, number];
};

export const projectAddr: HelperFunction<Giveth> = async (
  module,
  h,
  { interpretNode },
) => {
  checkArgsLength(h, {
    type: ComparisonType.Equal,
    minValue: 1,
  });

  const slug = await interpretNode(h.args[0]);

  return (await _projectAddr(module, slug))[0];
};
