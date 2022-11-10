import { providers } from 'ethers';

import { ErrorException } from '../../../errors';

import type { Action, ICommand } from '../../../types';
import { BindingsSpace, NodeType, isProviderAction } from '../../../types';

import { ComparisonType, checkArgsLength } from '../../../utils';

import type { Std } from '../Std';

export const sim: ICommand<Std> = {
  async run(module, c, { interpretNode }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 1,
    });

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

    if (
      !blockExpressionNode ||
      blockExpressionNode.type !== NodeType.BlockExpression
    ) {
      throw new ErrorException('last argument should be a set of commands');
    }

    const actions = (await interpretNode(blockExpressionNode, {
      blockModule: module.contextualName,
    })) as Action[];

    if (actions.find((a) => isProviderAction(a))) {
      throw new ErrorException(
        `can't switch networks inside a connect command`,
      );
    }

    const TENDERLY_FORK_API = `https://api.tenderly.co/api/v1/account/${tenderlyUser}/project/${tenderlyProject}/fork`;

    const body = {
      network_id: String(await module.getChainId()),
      // "block_number": <blockNumber>,
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

    for (const action of actions) {
      await provider.send('eth_sendTransaction', [
        {
          ...action,
          from: await module.getConnectedAccount(),
        },
      ]);
    }

    module.log(
      `https://dashboard.tenderly.co/${tenderlyUser}/${tenderlyProject}/fork/${forkId}`,
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
