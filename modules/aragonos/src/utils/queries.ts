export type GraphQLBody = {
  query: string;
  variables: Record<string, any>;
};

export const ORGANIZATION_APPS = (id: string): GraphQLBody => ({
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
            roleHash
            manager
            grantees {
              granteeAddress
            }
          }
          version {
            codeAddress
            contentUri
          }
        }
      }
    }
`,
  variables: {
    id,
  },
});
