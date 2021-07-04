import gql from "graphql-tag";

export const GET_REPO_DATA = (type: string) => gql`
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

export const GET_APP_ROLES = (type: string) => gql`
  ${type} App($appAddress: ID!) {
    app(id: $appAddress) {
      roles {
        roleHash
        manager
        grantees {
          granteeAddress
        }
      }
    }
  }
`;
