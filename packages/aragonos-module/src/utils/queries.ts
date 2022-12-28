export type GraphQLBody = {
  query: string;
  variables: Record<string, any>;
};

export type QueryConfig = {
  isGoerliSubgraph: boolean;
};

export const REPO = (
  repoName: string,
  registryName: string,
  versions: string[] = [],
): GraphQLBody => ({
  query: `
    query Repos($repoName: String!, $registryName: String! $versions: [String!]!) {
      repos(where: { name: $repoName, registry_: { name: $registryName } }) {
        lastVersion {
          artifact
          contentUri
          codeAddress
        }
        registry {
          name
        }
        versions(where: { semanticVersion_in: $versions }) {
          artifact
          codeAddress
          contentUri
        }
      }
    }
`,
  variables: {
    repoName,
    registryName,
    versions,
  },
});

export const ORGANIZATION_APPS = (
  id: string,
  { isGoerliSubgraph: isGoerli = false }: Partial<QueryConfig> = {},
): GraphQLBody => ({
  query: `
    query Organization($id: ID!) {
      organization(id: $id) {
        apps {
          address
          appId
          repo {
            name
            registry {
              name
            }
          }
          roles {
            ${isGoerli ? 'hash' : 'roleHash'}
            manager
            grantees {
              granteeAddress
            }
          }
          version {
            codeAddress
            contentUri
            ${isGoerli ? '' : 'artifact'}
          }
        }
      }
    }
`,
  variables: {
    id,
  },
});
