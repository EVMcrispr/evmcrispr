import type { ICommand } from '../../types';
import { BindingsSpace } from '../../types';
import { ComparisonType, checkArgsLength } from '../../utils';
import type { Std } from '../Std';

const { ADDR } = BindingsSpace;

export const print: ICommand<Std> = {
  buildCompletionItemsForArg(argIndex, _, cache) {
    switch (argIndex) {
      case 0: {
        return cache.getAllBindingIdentifiers({ spaceFilters: [ADDR] });
      }
      default:
        return [];
    }
  },
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, { type: ComparisonType.Greater, minValue: 1 });

    const varValue = await interpretNodes(c.args).then((strings) =>
      strings.join(''),
    );

    module.evmcrispr.log(varValue);
  },
  async runEagerExecution() {
    return;
  },
};
