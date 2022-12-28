import type {
  Address,
  BindingsManager,
  ICommand,
  Nullable,
} from '@1hive/evmcrispr';
import {
  BindingsSpace,
  ComparisonType,
  ErrorException,
  checkArgsLength,
  checkOpts,
  encodeCalldata,
  getOptValue,
  getRandomAddress,
  inSameLineThanNode,
  interpretNodeSync,
  tryAndCacheNotFound,
} from '@1hive/evmcrispr';
import type { providers } from 'ethers';
import { utils } from 'ethers';

import type { AragonDAO } from '../AragonDAO';
import type { AragonOS } from '../AragonOS';
import { _aragonEns } from '../helpers/aragonEns';
import type { App, AppArtifact } from '../types';
import {
  SEMANTIC_VERSION_REGEX,
  buildAppArtifact,
  buildAppPermissions,
  buildArtifactFromABI,
  fetchAppArtifact,
  getDAOs,
  getRepoContract,
  isLabeledAppIdentifier,
  parseLabeledAppIdentifier,
} from '../utils';
import { DAO_OPT_NAME, getDAOByOption } from '../utils/commands';

const { ABI, ADDR, OTHER } = BindingsSpace;

const fetchRepoData = async (
  appName: string,
  appRegistry: string,
  appVersion = 'latest',
  provider: providers.Provider,
  customEnsResolver?: string,
): Promise<{ codeAddress: Address; contentUri: string }> => {
  const repoENSName = `${appName}.${appRegistry}`;
  const repoAddr = await _aragonEns(repoENSName, provider, customEnsResolver);

  if (!repoAddr) {
    throw new ErrorException(
      `ENS repo name ${repoENSName} couldn't be resolved`,
    );
  }

  const repo = getRepoContract(repoAddr, provider);
  let codeAddress, rawContentUri;

  if (appVersion && appVersion !== 'latest') {
    if (!SEMANTIC_VERSION_REGEX.test(appVersion)) {
      throw new ErrorException(
        `invalid --version option. Expected a semantic version, but got ${appVersion}`,
      );
    }

    [, codeAddress, rawContentUri] = await repo.getBySemanticVersion(
      appVersion.split('.'),
    );
  } else {
    [, codeAddress, rawContentUri] = await repo.getLatest();
  }

  return { codeAddress, contentUri: utils.toUtf8String(rawContentUri) };
};

const setApp = (
  dao: AragonDAO,
  app: App,
  artifact: AppArtifact,
  bindingsManager: BindingsManager,
): void => {
  dao.appArtifactCache.set(app.codeAddress, artifact);
  dao.appCache.set(app.name, app);

  bindingsManager.setBinding(app.codeAddress, app.abiInterface, ABI);
  bindingsManager.setBinding(app.address, app.abiInterface, ABI);

  if (!bindingsManager.hasBinding(app.name, ADDR)) {
    bindingsManager.setBinding(app.name, app.address, ADDR);
  }
};

export const install: ICommand<AragonOS> = {
  async run(module, c, { interpretNode, interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 1,
    });
    checkOpts(c, [DAO_OPT_NAME, 'version']);

    const dao = await getDAOByOption(c, module.bindingsManager, interpretNode);

    const [identifierNode, ...paramNodes] = c.args;
    const identifier = await interpretNode(identifierNode, {
      treatAsLiteral: true,
    });
    const version = await getOptValue(c, 'version', interpretNode);
    const [appName, registry] = parseLabeledAppIdentifier(identifier);

    if (dao.appCache.has(identifier)) {
      throw new ErrorException(`identifier ${identifier} is already in use.`);
    }

    const { codeAddress, contentUri } = await fetchRepoData(
      appName,
      registry,
      version ?? 'latest',
      await module.getProvider(),
      module.getConfigBinding('ensResolver'),
    );

    const daos = getDAOs(module.bindingsManager);
    const selectedDAOArtifacts = daos
      .filter((dao) => dao.appArtifactCache.has(codeAddress))
      .map((dao) => dao.appArtifactCache.get(codeAddress)!);
    let artifact: AppArtifact;

    if (!selectedDAOArtifacts.length) {
      const rawArtifact = await fetchAppArtifact(
        module.ipfsResolver,
        contentUri,
      );
      artifact = buildAppArtifact(rawArtifact);
    } else {
      artifact = selectedDAOArtifacts[0];
    }

    const { abiInterface, roles } = artifact;
    const kernel = dao.kernel;
    const initParams = await interpretNodes(paramNodes);

    const fnFragment = abiInterface.getFunction('initialize');
    const encodedInitializeFunction = encodeCalldata(fnFragment, initParams);

    const appId = utils.namehash(`${appName}.${registry}`);
    if (!module.bindingsManager.getBindingValue(identifier, ADDR)) {
      await module.registerNextProxyAddress(identifier, kernel.address);
    }
    const proxyContractAddress = module.bindingsManager.getBindingValue(
      identifier,
      ADDR,
    )!;

    setApp(
      dao,
      {
        abiInterface,
        address: proxyContractAddress,
        codeAddress,
        contentUri,
        name: identifier,
        permissions: buildAppPermissions(roles, []),
        registryName: registry,
      },
      artifact,
      module.bindingsManager,
    );

    return [
      {
        to: kernel.address,
        data: kernel.abiInterface.encodeFunctionData(
          'newAppInstance(bytes32,address,bytes,bool)',
          [appId, codeAddress, encodedInitializeFunction, false],
        ),
      },
    ];
  },
  buildCompletionItemsForArg(argIndex, _, bindingsManager) {
    switch (argIndex) {
      default: {
        /**
         * Only provide suggestions for the new app initialize function
         * parameters
         */
        if (argIndex > 0) {
          const identifiers = bindingsManager.getAllBindingIdentifiers({
            spaceFilters: [ADDR],
          });
          return identifiers;
        }

        return [];
      }
    }
  },
  async runEagerExecution(c, cache, { provider, ipfsResolver }, caretPos) {
    if (inSameLineThanNode(c, caretPos)) {
      return;
    }
    const repoNode = c.args[0];

    const labeledAppIdentifier = repoNode.value;

    // Skip over if no valid labeled app identifer was provided
    if (!isLabeledAppIdentifier(labeledAppIdentifier)) {
      return;
    }
    const [appName, appRegistry] =
      parseLabeledAppIdentifier(labeledAppIdentifier);
    let artifact: AppArtifact,
      proxyAddress: Nullable<Address> | undefined,
      codeAddress: Nullable<Address> | undefined;

    proxyAddress = cache.getBindingValue(labeledAppIdentifier, OTHER);
    if (proxyAddress) {
      codeAddress = cache.getBindingValue(proxyAddress, OTHER);
    }

    if (!codeAddress) {
      const repoData = await tryAndCacheNotFound(
        () => fetchRepoData(appName, appRegistry, 'latest', provider),
        `${appName}.${appRegistry}`,
        ADDR,
        cache,
      );

      if (!repoData) {
        return;
      }

      codeAddress = repoData.codeAddress;
      // Check if there's already an ABI for this implementation
      const abiInterface = cache.getBindingValue(codeAddress, ABI);

      if (!abiInterface) {
        const rawArtifact = await tryAndCacheNotFound(
          () => fetchAppArtifact(ipfsResolver, repoData.contentUri),
          codeAddress,
          ABI,
          cache,
        );

        if (!rawArtifact) {
          return;
        }

        artifact = buildAppArtifact(rawArtifact);
        proxyAddress = getRandomAddress();
        // Cache fetched ABI
        cache.setBinding(codeAddress, artifact.abiInterface, ABI);

        /**
         * Cache both mock proxy address and code address so we can
         * retrieve the app's ABI on following executions
         */
        cache.setBinding(labeledAppIdentifier, proxyAddress, OTHER);
        cache.setBinding(proxyAddress, codeAddress, OTHER);
      } else {
        artifact = buildArtifactFromABI(appName, appRegistry, abiInterface);
      }
    } else {
      const abiInterface = cache.getBindingValue(codeAddress, ABI)!;
      artifact = buildArtifactFromABI(appName, appRegistry, abiInterface);
    }

    return (eagerBindingsManager) => {
      const daoOpt = c.opts.find((opt) => opt.name === 'dao');
      const daoOptValue = daoOpt
        ? interpretNodeSync(daoOpt, eagerBindingsManager)
        : undefined;
      const dao = eagerBindingsManager.getBindingValue(
        daoOptValue ?? 'currentDAO',
        BindingsSpace.DATA_PROVIDER,
      ) as AragonDAO | undefined;

      if (!dao) {
        return;
      }

      const app: App = {
        abiInterface: artifact.abiInterface,
        address: proxyAddress!,
        codeAddress: codeAddress!,
        contentUri: '',
        name: labeledAppIdentifier,
        permissions: buildAppPermissions(artifact.roles, []),
        registryName: appRegistry,
      };

      setApp(dao, app, artifact, eagerBindingsManager);
    };
  },
};
