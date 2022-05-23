import ora from 'ora';

import fs from 'fs';
import {
  IPFS_GATEWAY,
  buildIpfsTemplate,
  fetchAppArtifact,
  parseContentUri,
} from '../src/utils';
import {
  basePath,
  fetchOrganizationApps,
  fetchRepo,
  generateMockDAOFile,
} from './helpers/fixtures';
import { IPFSResolver } from '../src/IPFSResolver';

const CHAIN_ID = 4; // Rinkeby
const DAO_ADDRESS = '0x8bebd1c49336Bf491ef7bd8a7f9A5d267081b33E';
const REPO_NAME = 'token-manager';
const REGISTRY_NAME = 'aragonpm.eth';

let spinner = ora();

const resolver = new IPFSResolver(buildIpfsTemplate(IPFS_GATEWAY));

const createDAOAppsFixture = async () => {
  spinner = spinner.start('Create organization apps fixture');

  const daoAppsResponse = await fetchOrganizationApps(DAO_ADDRESS, CHAIN_ID);

  if (!daoAppsResponse.data.organization) {
    throw new Error(`DAO ${DAO_ADDRESS} used to create fixtures not found`);
  }

  if (!daoAppsResponse.data.organization.apps) {
    throw new Error(
      `DAO ${DAO_ADDRESS} used to create fixtures doesn't have apps`,
    );
  }

  const daoApps: any[] = daoAppsResponse.data.organization.apps;

  // Fetch missing artifacts
  const artifactlessApps: any[] = daoApps.filter(
    (app: any) => !app.version?.artifact && app.version?.contentUri,
  );
  const contentUris: Set<string> = new Set(
    artifactlessApps.map((app) => app.version.contentUri),
  );
  const iterableContentUris = [...contentUris];
  const artifacts: any[] = await Promise.all(
    iterableContentUris.map((contentUri) =>
      fetchAppArtifact(resolver, contentUri),
    ),
  );

  // Write artifacts to json files
  iterableContentUris.forEach((contentUri, index) => {
    const artifact = artifacts[index];
    fs.writeFileSync(
      basePath(`artifacts/${parseContentUri(contentUri)}.json`),
      JSON.stringify(artifact),
    );
  });

  // Write mock dao file
  generateMockDAOFile(daoApps);

  // Write subgraph response to json file
  fs.writeFileSync(
    basePath('subgraph-data/OrganizationAppsResponse.json'),
    JSON.stringify(daoAppsResponse),
  );

  spinner.succeed();
};

const createRepoFixture = async () => {
  spinner = spinner.start('Create app repo fixture');
  const reposResponse = await fetchRepo(REPO_NAME, CHAIN_ID);
  const repo = reposResponse.data.repos
    ?.filter(
      ({ registry }: { registry: any }) => registry.name === REGISTRY_NAME,
    )
    .pop();

  if (!repo) {
    throw new Error(
      `Repo ${REPO_NAME}.${REGISTRY_NAME} used to create fixtures not found.`,
    );
  }
  const { artifact, contentUri } = repo.version || {};

  if (!contentUri && !artifact) {
    throw new Error(`Repo ${REPO_NAME}.${REGISTRY_NAME} artifact not found.`);
  }

  // Fetch app repo's artifact if is not included in subgraph response.
  if (!artifact) {
    const artifact = await fetchAppArtifact(resolver, contentUri);
    fs.writeFileSync(
      basePath(`artifacts/${parseContentUri(contentUri)}.json`),
      JSON.stringify(artifact),
    );
  }

  // Write app repo file to json file
  fs.writeFileSync(
    basePath('subgraph-data/RepoResponse.json'),
    JSON.stringify({ data: { repos: [repo] } }),
  );

  spinner.succeed();
};

const main = async () => {
  if (!fs.existsSync(basePath('artifacts'))) {
    fs.mkdirSync(basePath('artifacts'));
  }

  if (!fs.existsSync(basePath('subgraph-data'))) {
    fs.mkdirSync(basePath('subgraph-data'));
  }

  await createDAOAppsFixture();
  await createRepoFixture();
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    spinner.fail();
    console.error(error);
    process.exit(1);
  });
