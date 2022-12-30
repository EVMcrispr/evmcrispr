import { IPFSResolver } from '@1hive/evmcrispr';
import {
  fetchAppArtifact,
  parseContentUri,
} from '@1hive/evmcrispr-aragonos-module/src/utils';
import ora from 'ora';

import {
  basePath,
  fetchOrganizationApps,
  fetchRepo,
  generateArtifactsIndexFile,
  generateMockDAOFile,
  generateSubgraphDataIndexFile,
} from './helpers/fixtures';
import fs from 'fs';

// // Rinkeby
// const CHAIN_ID = 4;
// const DAO_ADDRESSES: string[] = [
//   '0x8bebd1c49336Bf491ef7bd8a7f9A5d267081b33E',
//   '0xb2a22974bd09eb5d1b5c726e7c29f4faef636dd2',
//   '0x0d9938b8720eb5124371c9fa2049144626f67d2e',
// ];
// // [<repoName>, <registryName>, <versions>]
// const REPOS: [string, string, string[]][] = [
//   ['token-manager', 'aragonpm.eth', ['1,0,0']],
// ];

// Gnosis Chain
const CHAIN_ID = 100;
const DAO_ADDRESSES: string[] = [
  '0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8', // TEC
  '0x8ccbeab14b5ac4a431fffc39f4bec4089020a155', // 1hive,
  '0xb56a8003a8d2efab7d2d4c10617d787e9e4b582c', // TEC Hatch
  '0xA1514067E6fE7919FB239aF5259FfF120902b4f9', // nrGIV
];
const REPOS: [string, string, string[]][] = [
  ['token-manager', 'aragonpm.eth', ['1,0,2']],
];

let spinner = ora();

const resolver = new IPFSResolver();

const createDAOAppsFixture = async (): Promise<string[]> => {
  let i = 0;
  const contentUris: Set<string> = new Set();

  for (const daoAddress of DAO_ADDRESSES) {
    spinner = spinner.start(`Create fixture for DAO ${daoAddress} apps`);

    const daoAppsResponse = await fetchOrganizationApps(daoAddress, CHAIN_ID);

    if (!daoAppsResponse.data.organization) {
      throw new Error(`DAO ${daoAddress} used to create fixtures not found`);
    }

    if (!daoAppsResponse.data.organization.apps) {
      throw new Error(
        `DAO ${daoAddress} used to create fixtures doesn't have apps`,
      );
    }

    const daoApps: any[] = daoAppsResponse.data.organization.apps;

    // Fetch missing artifacts
    const artifactlessApps: any[] = daoApps.filter(
      (app: any) => !app.version?.artifact && app.version?.contentUri,
    );

    // Keep track of missing artifacts
    artifactlessApps.forEach((app) => contentUris.add(app.version.contentUri));

    // Write mock dao file
    generateMockDAOFile(daoApps, i);

    // Write subgraph response to json file
    fs.writeFileSync(
      basePath(`subgraph-data/${daoAddress}.json`),
      JSON.stringify(daoAppsResponse),
    );
    spinner.succeed();
    i++;
  }

  spinner.succeed();

  return [...contentUris];
};

const createReposFixture = async (): Promise<string[]> => {
  spinner = spinner.start('Create app repo fixture');

  const contentUris = new Set<string>();
  const reposResponse = await Promise.all(
    REPOS.map(([name, registry, versions]) =>
      fetchRepo(name, registry, versions, CHAIN_ID),
    ),
  );

  let i = 0;
  for (const repoResponse of reposResponse) {
    const [name, registry] = REPOS[i];
    const repo = repoResponse.data.repos[0];

    const { artifact, contentUri } = repo.lastVersion || {};

    if (!contentUri && !artifact) {
      throw new Error(`Repo ${name}.${registry} artifact can't be found.`);
    }

    // Fetch app repo's artifact if is not included in subgraph response.
    if (!artifact) {
      contentUris.add(contentUri);
    }

    if (repo.versions) {
      repo.versions.forEach((v: any) => {
        contentUris.add(v.contentUri);
      });
    }

    fs.writeFileSync(
      basePath(`subgraph-data/${name}.json`),
      JSON.stringify({ data: { repos: [repoResponse.data.repos[0]] } }),
    );

    i++;
  }

  spinner.succeed();

  return [...contentUris];
};

const main = async () => {
  if (!fs.existsSync(basePath('artifacts'))) {
    fs.mkdirSync(basePath('artifacts'));
  }

  if (!fs.existsSync(basePath('subgraph-data'))) {
    fs.mkdirSync(basePath('subgraph-data'));
  }

  const missingAppCids = await createDAOAppsFixture();

  const missingRepoCids = await createReposFixture();

  generateSubgraphDataIndexFile(
    DAO_ADDRESSES,
    REPOS.map(([repoName]) => repoName),
  );

  spinner = spinner.start('Fetch missing artifacts');
  const contentUris = new Set<string>([...missingAppCids, ...missingRepoCids]);
  const iterableContentUris = [...contentUris];

  const artifacts: any[] = await Promise.all(
    iterableContentUris.map((contentUri) =>
      fetchAppArtifact(resolver, contentUri),
    ),
  );

  spinner.succeed();

  spinner = spinner.start('Create artifact files');
  // Write artifacts to json files
  iterableContentUris.forEach((contentUri, index) => {
    const artifact = artifacts[index];
    fs.writeFileSync(
      basePath(`artifacts/${parseContentUri(contentUri)}.json`),
      JSON.stringify(artifact),
    );
  });

  generateArtifactsIndexFile(
    iterableContentUris.map((c) => parseContentUri(c)),
  );

  spinner.succeed();
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    spinner.fail();
    console.error(error);
    process.exit(1);
  });
