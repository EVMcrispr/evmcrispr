import fs from "fs";
import { subgraphUrlFromChainId } from "../../src/Connector";
import { getSystemApp, parseRegistry } from "../../src/helpers";

export const basePath = (relativePath: string): string => `test/fixtures/${relativePath}`;

export const fetchOrganizationApps = (daoAddress: string, chainId: number): Promise<any> => {
  const subgraphUrl = subgraphUrlFromChainId(chainId);

  if (!subgraphUrl) {
    throw new Error(`Chain id ${chainId} invalid.`);
  }
  return fetch(subgraphUrl!, {
    method: "POST",
    body: JSON.stringify({
      query: `
        {
          organization(id: "${daoAddress.toLowerCase()}") {
            id
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
            }
          }
        }
      `,
    }),
  }).then((res) => res.json());
};

export const fetchRepo = (repoName: string, chainId: number): Promise<any> => {
  const subgraphUrl = subgraphUrlFromChainId(chainId);

  if (!subgraphUrl) {
    throw new Error(`Chain id ${chainId} invalid.`);
  }

  return fetch(subgraphUrl!, {
    method: "POST",
    body: JSON.stringify({
      query: `
        {
          repos(where: { name: "${repoName}" }) {
            name
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
    }),
  }).then((res) => res.json());
};

export const generateMockDAOFile = (daoApps: any[]): void => {
  const daoObjString = daoApps.reduce((daoObjStr: any, app: any, index) => {
    const { address, appId, repoName, repo } = app;
    const appName = getSystemApp(appId)?.name ?? `${repoName}${parseRegistry(repo.registry.name)}`;
    let str = `${daoObjStr}\n  ["${appName}"]: "${address}",`;

    if (index === daoApps.length - 1) {
      str = `${str}\n};`;
    }

    return str;
  }, "{");

  const file = `// WARNING: this file is generated automatically\n\nexport const DAO = ${daoObjString}\n\n// Needed to build the MockEVMcrispr cache\nexport const KERNEL_TRANSACTION_COUNT = ${
    Object.keys(daoApps).length
  };\n`;

  fs.writeFileSync(basePath("mock-dao.ts"), file);
};
