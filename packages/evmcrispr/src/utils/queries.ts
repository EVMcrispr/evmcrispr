export type GraphQLBody = {
  query: string;
  variables: Record<string, any>;
};

export const REPO = (repoName: string): GraphQLBody => ({
  query: `
    query Repos($repoName: String!) {
      repos(where: { name: $repoName }) {
        lastVersion {
          artifact
          contentUri
          codeAddress
        }
        registry {
          name
        }
      }
    }
`,
  variables: {
    repoName,
  },
});

export const ORGANIZATION_APPS = (id: string): GraphQLBody => ({
  query: `
    query Organization($id: ID!) {
      organization(id: $id) {
        apps {
          address
          appId
          repoName
          implementation {
            address
          }
          repo {
            registry {
              name
            }
          }
          roles {
            roleHash
            manager
            grantees {
              granteeAddress
            }
          }
          version {
            codeAddress
            contentUri
            artifact
          }
        }
      }
    }
`,
  variables: {
    id,
  },
});
