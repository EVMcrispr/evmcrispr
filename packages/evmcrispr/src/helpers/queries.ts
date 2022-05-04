import { gql } from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const REPO = (type: string): DocumentNode => gql`
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

export const ORGANIZATION_APPS = (type: string): DocumentNode => gql`
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
