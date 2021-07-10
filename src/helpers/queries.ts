import gql from "graphql-tag";

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
          lastVersion {
            contentUri
            artifact
          }
        }
        roles {
          roleHash
          manager
          grantees {
            granteeAddress
          }
        }
      }
    }
  }
`;
