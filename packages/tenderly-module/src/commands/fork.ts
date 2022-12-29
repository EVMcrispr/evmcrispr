import {
  BindingsSpace,
  ComparisonType,
  ErrorException,
  NodeType,
  checkArgsLength,
  checkOpts,
  getOptValue,
  isProviderAction,
  isSwitchAction,
} from '@1hive/evmcrispr';
import type { Action, ICommand } from '@1hive/evmcrispr';
import { BigNumber, providers, utils } from 'ethers';

import type { Tenderly } from '../Tenderly';

export const fork: ICommand<Tenderly> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });
    checkOpts(c, ['block-number', 'from']);

    // set up your access-key, if you don't have one or you want to generate new one follow next link
    // https://dashboard.tenderly.co/account/authorization
    const tenderly = module.bindingsManager.getBindingValue(
      '$tenderly',
      BindingsSpace.USER,
    );
    const [tenderlyUser, tenderlyProject, tenderlyAccessKey] =
      tenderly?.split('/') || [];

    if (!tenderlyAccessKey) {
      throw new ErrorException(
        'No $tenderly variable definied or not definied properly',
      );
    }

    const [blockExpressionNode] = c.args;
    const blockNumber = await getOptValue(c, 'block-number', interpretNode);
    const from = await getOptValue(c, 'from', interpretNode);

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException('last argument should be a set of commands');
    }

    const TENDERLY_FORK_API = `https://api.tenderly.co/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/fork`;

    const body = {
      network_id: String(await module.getChainId()),
      block_number: blockNumber ? Number(blockNumber.toString()) : undefined,
    };

    const opts = {
      method: 'POST',
      headers: {
        'X-Access-Key': tenderlyAccessKey as string,
      },
      body: JSON.stringify(body),
    };

    const forkId = await fetch(TENDERLY_FORK_API, opts)
      .then((res) => res.json())
      .then((data: any) => data.simulation_fork.id);

    const forkRPC = `https://rpc.tenderly.co/fork/${forkId}`;

    const provider = new providers.JsonRpcProvider(forkRPC);

    module.evmcrispr.setConnectedAccount(from);
    module.evmcrispr.setProvider(provider);

    const simulateAction = async (action: Action) => {
      if (isSwitchAction(action)) {
        throw new ErrorException(`can't switch networks inside a fork command`);
      }
      if (isProviderAction(action)) {
        await provider.send(action.method, action.params);
      } else {
        const tx = await provider.send('eth_sendTransaction', [
          {
            from: await module.getConnectedAccount(),
            ...action,
            value: utils.hexValue(BigNumber.from(action.value || 0)),
          },
        ]);
        const receipt = await provider.waitForTransaction(tx);
        if (receipt.status == 0) {
          module.evmcrispr.log(
            `:error: A transaction failed: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/fork/${forkId}).`,
          );
          throw new ErrorException(`Transaction failed.`);
        }
      }
    };

    await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
      actionCallback: simulateAction,
    });

    module.evmcrispr.setProvider(undefined);
    module.evmcrispr.setConnectedAccount(undefined);

    module.evmcrispr.log(
      `:success: All transactions succeeded: [*Click here to watch on Tenderly*](https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/fork/${forkId}).`,
    );

    return [];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
