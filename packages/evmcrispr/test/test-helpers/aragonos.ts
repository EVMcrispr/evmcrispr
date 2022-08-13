import type { Signer } from 'ethers';

import type { Address } from '../../src';

import type { Interpreter } from '../../src/cas11/interpreter/Interpreter';

import type { AragonOS } from '../../src/cas11/modules/aragonos/AragonOS';
import { getAragonEnsResolver, resolveName } from '../../src/utils';
import { createInterpreter } from './cas11';

export const _aragonEns = async (
  ensName: string,
  module: AragonOS,
): Promise<string | null> => {
  const ensResolver = module.getModuleBinding('ensResolver', true);

  const name = await resolveName(
    ensName,
    ensResolver || getAragonEnsResolver(await module.signer.getChainId()),
    module.signer,
  );

  return name;
};

export const createAragonScriptInterpreter =
  (signer: Signer, daoAddress: Address) =>
  (commands: string[] = []): Interpreter => {
    return createInterpreter(
      `
  load aragonos as ar
  ar:connect ${daoAddress} (
    ${commands.join('\n')}
  )
`,
      signer,
    );
  };
