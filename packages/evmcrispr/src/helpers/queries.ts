import gql from 'graphql-tag';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const REPO = (type: string) => gql`
  ${type} Repos($repoName: String!) {
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
`;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const ORGANIZATION_APPS = (type: string) => gql`
  ${type} Organization($id: ID!) {
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
`;
