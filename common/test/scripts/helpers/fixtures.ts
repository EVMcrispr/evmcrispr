import { subgraphUrlFromChainId } from '@1hive/evmcrispr-aragonos-module/src/Connector';
import {
  ORGANIZATION_APPS,
  REPO,
  getSystemApp,
  parseRegistry,
} from '@1hive/evmcrispr-aragonos-module/src/utils';

import fs from 'fs';

export const basePath = (relativePath: string): string =>
  `test/fixtures/${relativePath}`;

export const SUBGRAPH_DIRECTORY = 'subgraph-data';
export const ARTIFACTS_DIRECTORY = 'artifacts';

export const fetchOrganizationApps = (
  daoAddress: string,
  chainId: number,
): Promise<any> => {
  const subgraphUrl = subgraphUrlFromChainId(chainId);

  if (!subgraphUrl) {
    throw new Error(`Chain id ${chainId} invalid.`);
  }
  return fetch(subgraphUrl!, {
    method: 'POST',
    body: JSON.stringify(ORGANIZATION_APPS(daoAddress.toLowerCase())),
  }).then((res) => res.json());
};

export const fetchRepo = (
  name: string,
  registry = 'aragonpm.eth',
  versions: string[] = [],
  chainId: number,
): Promise<any> => {
  const subgraphUrl = subgraphUrlFromChainId(chainId);

  if (!subgraphUrl) {
    throw new Error(`Chain id ${chainId} invalid.`);
  }

  return fetch(subgraphUrl!, {
    method: 'POST',
    body: JSON.stringify(REPO(name, registry, versions)),
  }).then((res) => res.json());
};

export const generateMockDAOFile = (daoApps: any[], index: number): void => {
  const daoObjString = daoApps.reduce((daoObjStr: any, app: any, index) => {
    const { address, appId, repoName, repo } = app;
    const appName =
      getSystemApp(appId)?.name ??
      `${repoName}${parseRegistry(repo.registry.name)}`;
    let str = `${daoObjStr}\n  ['${appName}']: '${address}',`;

    if (index === daoApps.length - 1) {
      str = `${str}\n};`;
    }

    return str;
  }, '{');

  const file = `// WARNING: this file is generated automatically\n\nexport const DAO = ${daoObjString}\n\n// Needed to build the MockEVMcrispr cache\nexport const KERNEL_TRANSACTION_COUNT = ${
    Object.keys(daoApps).length
  };\n`;

  fs.writeFileSync(
    basePath(`mock-dao${index ? `-${index + 1}` : ''}.ts`),
    file,
  );
};

export const generateArtifactsIndexFile = (contentUris: string[]): void => {
  let file = '// WARNING: this file is generated automatically\n';
  contentUris.forEach((contentUri) => {
    file += `import ${contentUri} from './${contentUri}.json'\n`;
  });

  file += '\n';
  file += 'export const artifacts = {\n';
  contentUris.forEach((contentUri) => {
    file += `${contentUri},\n`;
  });
  file += `}\n`;

  fs.writeFileSync(basePath(`${ARTIFACTS_DIRECTORY}/index.ts`), file);
};

export const generateSubgraphDataIndexFile = (
  daoAddresses: string[],
  repoNames: string[],
): void => {
  let file = '// WARNING: this file is generated automatically\n';

  daoAddresses.forEach((daoAddress, i) => {
    file += `import dao${i} from './${daoAddress}.json';\n`;
  });
  repoNames.forEach((repoName, i) => {
    file += `import app${i} from './${repoName}.json';\n`;
  });

  file += '\n';
  file += 'export const DAOs = {\n';
  daoAddresses.forEach((daoAddress, i) => {
    file += `'${daoAddress}': dao${i},\n`;
  });
  file += '};\n';

  file += '\n';

  file += 'export const REPOs = {\n';

  repoNames.forEach((repoName, i) => {
    file += `['${repoName}']: app${i},\n`;
  });

  file += '}\n';

  fs.writeFileSync(basePath(`${SUBGRAPH_DIRECTORY}/index.ts`), file);
};
