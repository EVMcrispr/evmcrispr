import type {
  BindingsManager,
  CommandExpressionNode,
  Node,
  NodeInterpreter,
} from '@1hive/evmcrispr';
import {
  BindingsSpace,
  ErrorException,
  NodeType,
  getOptValue,
  listItems,
} from '@1hive/evmcrispr';
import type { Parser } from 'arcsecond';
import { char, possibly, regex, sequenceOf } from 'arcsecond';
import { utils } from 'ethers';

import type { AragonDAO } from '../AragonDAO';
import type { CompletePermission } from '../types';
import { optionalLabeledAppIdentifierRegex } from './identifiers';

const { DATA_PROVIDER } = BindingsSpace;

export const DAO_OPT_NAME = 'dao';

export const daoPrefixedIdentifierParser: Parser<
  [string | undefined, string],
  string,
  any
> = sequenceOf([
  possibly(
    sequenceOf([char('_'), regex(/^((?!-)[a-zA-Z0-9-]+(?<!-))/), char(':')]),
  ),
  regex(optionalLabeledAppIdentifierRegex),
]).map(([prefix, appIdentifier]) => [
  prefix ? prefix[1] : undefined,
  appIdentifier,
]);

export const getDAO = (
  bindingsManager: BindingsManager,
  appNode: Node,
): AragonDAO => {
  let dao = bindingsManager.getBindingValue('currentDAO', DATA_PROVIDER) as
    | AragonDAO
    | undefined;

  if (appNode.type === NodeType.ProbableIdentifier) {
    const res = daoPrefixedIdentifierParser.run(appNode.value);

    if (!res.isError && res.result[0]) {
      const [daoIdentifier] = res.result;

      dao = bindingsManager.getBindingValue(daoIdentifier, DATA_PROVIDER) as
        | AragonDAO
        | undefined;
      if (!dao) {
        throw new ErrorException(
          `couldn't found a DAO for ${daoIdentifier} on given identifier ${appNode.value}`,
        );
      }
    }
  }

  if (!dao) {
    throw new ErrorException('must be used within a "connect" command');
  }

  return dao;
};

export const getDAOByOption = async (
  c: CommandExpressionNode,
  bindingsManager: BindingsManager,
  interpretNode: NodeInterpreter,
): Promise<AragonDAO> => {
  let daoIdentifier = await getOptValue(c, 'dao', interpretNode);

  let dao: AragonDAO | undefined;

  if (!daoIdentifier) {
    dao = bindingsManager.getBindingValue(
      'currentDAO',
      DATA_PROVIDER,
    ) as AragonDAO;
    if (!dao) {
      throw new ErrorException(`must be used within a "connect" command`);
    }
  } else {
    daoIdentifier = daoIdentifier.toString
      ? daoIdentifier.toString()
      : daoIdentifier;
    dao = bindingsManager.getBindingValue(daoIdentifier, DATA_PROVIDER) as
      | AragonDAO
      | undefined;
    if (!dao) {
      throw new ErrorException(
        `--dao option error. No DAO found for identifier ${daoIdentifier}`,
      );
    }
  }

  return dao;
};

export const isPermission = (p: any[]): p is CompletePermission | never => {
  const errors: string[] = [];
  const [granteeAddress, appAddress, role, managerAddress] = p;

  if (!utils.isAddress(granteeAddress)) {
    errors.push(
      `Invalid grantee. Expected an address, but got ${granteeAddress}`,
    );
  }

  if (!utils.isAddress(appAddress)) {
    errors.push(`Invalid app. Expected an address, but got ${appAddress}`);
  }

  if (role.startsWith('0x')) {
    if (role.length !== 66) {
      errors.push(`Invalid role. Expected a valid hash, but got ${role}`);
    }
  }

  if (managerAddress && !utils.isAddress(managerAddress)) {
    errors.push(
      `Invalid permission manager. Expected an address, but got ${managerAddress}`,
    );
  }

  if (errors.length) {
    throw new ErrorException(listItems('invalid permission provided', errors));
  }

  return true;
};
