import { addressesEqual } from '@1hive/connect-core';
import type { ParseFunction } from '@1hive/connect-thegraph';
import { GraphQLWrapper } from '@1hive/connect-thegraph';

import { Connector } from '../../src';

import orgAppsResponse from './subgraph-data/OrganizationAppsResponse.json';
import repoResponse from './subgraph-data/RepoResponse.json';

class MockGraphQLWrapper extends GraphQLWrapper {
  constructor(subgraphUrl: string) {
    super(subgraphUrl);
  }

  performQueryWithParser(
    query: any,
    args: any,
    parserFn: ParseFunction,
  ): Promise<any> {
    return new Promise((resolve) => {
      const argsKeys = Object.keys(args);
      let response = null;

      if (argsKeys.find((key) => key === 'repoName')) {
        /**
         * Return an empty response object if the received query arguments don't
         * match the subgraph response fixture
         */
        response = repoResponse.data.repos.find(
          (repo) => repo.name === (args.repoName as string),
        )
          ? repoResponse
          : { data: { repos: [] } };
      } else if (argsKeys.find((key) => key === 'id')) {
        response = addressesEqual(orgAppsResponse.data.organization.id, args.id)
          ? orgAppsResponse
          : { data: { organization: null } };
      }

      resolve(parserFn(response));
    });
  }
}

class MockConnector extends Connector {
  constructor(chainId: number) {
    super(chainId);
    this._gql = new MockGraphQLWrapper(' ');
  }
}

export default MockConnector;
