import gql from "graphql-tag";

export const GET_REPO_DATA = (type: string) => gql`
  ${type} Repos($repoName: String!) {
    repos(where: { name: $repoName }) {
      lastVersion {
        contentUri
        codeAddress
      }
      registry {
        name
      }
    }
  }
`;

export const GET_APP_CONTENT_URI = (type: string) => gql`
  ${type} Apps($appAddress: String!) {
    apps(where: { address: $appAddress}) {
      lastVersion {
        contentUri
      }
    }
  }
`;
