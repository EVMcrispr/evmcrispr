import { utils } from 'ethers';

import {
  ComparisonType,
  checkArgsLength,
  checkOpts,
  encodeCalldata,
  getOptValue,
} from '../../../utils';
import { BindingsSpace } from '../../../BindingsManager';
import { EVMcrispr } from '../../../EVMcrispr';
import type { CommandFunction } from '../../../types';
import type { AragonOS } from '../AragonOS';
import { _aragonEns } from '../helpers/aragonEns';
import {
  SEMANTIC_VERSION_REGEX,
  buildAppArtifact,
  buildAppPermissions,
  fetchAppArtifact,
  getRepoContract,
  parseLabeledAppIdentifier,
} from '../utils';
import { DAO_OPT_NAME, getDAOByOption } from '../utils/commands';

export const install: CommandFunction<AragonOS> = async (
  module,
  c,
  { interpretNode, interpretNodes },
) => {
  checkArgsLength(c, {
    type: ComparisonType.Greater,
    minValue: 1,
  });
  checkOpts(c, [DAO_OPT_NAME, 'version']);

  const dao = await getDAOByOption(module, c, interpretNode);

  const [identifierNode, ...paramNodes] = c.args;
  const identifier = await interpretNode(identifierNode, {
    treatAsLiteral: true,
  });
  let appName: string, registry: string;

  try {
    [appName, registry] = parseLabeledAppIdentifier(identifier);
  } catch (err) {
    const err_ = err as Error;
    EVMcrispr.panic(c, err_.message);
  }

  const repoENSName = `${appName}.${registry}`;
  const repoAddr = await _aragonEns(repoENSName, module);

  if (!repoAddr) {
    EVMcrispr.panic(c, `ENS repo name ${repoENSName} couldn't be resolved`);
  }

  const repo = getRepoContract(repoAddr, module.signer);

  const version = await getOptValue(c, 'version', interpretNode);
  let codeAddress, rawContentUri;

  if (version) {
    if (!SEMANTIC_VERSION_REGEX.test(version)) {
      EVMcrispr.panic(
        c,
        `invalid --version option. Expected a semantic version, but got ${version}`,
      );
    }

    [, codeAddress, rawContentUri] = await repo.getBySemanticVersion(
      version.split('.'),
    );
  } else {
    [, codeAddress, rawContentUri] = await repo.getLatest();
  }

  const contentUri = utils.toUtf8String(rawContentUri);
  // Fallback to IPFS to retrieve app's data
  if (!dao.appArtifactCache.has(codeAddress)) {
    const artifact = await fetchAppArtifact(module.ipfsResolver, contentUri);
    dao.appArtifactCache.set(codeAddress, buildAppArtifact(artifact));
  }

  const { abiInterface, roles } = dao.appArtifactCache.get(codeAddress)!;
  const kernel = dao.kernel;
  const initParams = await interpretNodes(paramNodes);

  let encodedInitializeFunction: string;

  try {
    const fnFragment = abiInterface.getFunction('initialize');
    encodedInitializeFunction = encodeCalldata(fnFragment, initParams);
  } catch (err: any) {
    const err_ = err as Error;

    EVMcrispr.panic(c, err_.message);
  }

  const appId = utils.namehash(`${appName}.${registry}`);
  if (!module.bindingsManager.getBinding(identifier, BindingsSpace.ADDR)) {
    await module.registerNextProxyAddress(identifier, kernel.address);
  }
  const proxyContractAddress = module.bindingsManager.getBinding(
    identifier,
    BindingsSpace.ADDR,
  );

  if (dao.appCache.has(identifier)) {
    EVMcrispr.panic(c, `identifier ${identifier} is already in use.`);
  }

  dao.appCache.set(identifier, {
    abiInterface: abiInterface,
    address: proxyContractAddress,
    codeAddress,
    contentUri,
    name: appName,
    permissions: buildAppPermissions(roles, []),
    registryName: registry,
  });

  return [
    {
      to: kernel.address,
      data: kernel.abiInterface.encodeFunctionData(
        'newAppInstance(bytes32,address,bytes,bool)',
        [appId, codeAddress, encodedInitializeFunction, false],
      ),
    },
  ];
};
