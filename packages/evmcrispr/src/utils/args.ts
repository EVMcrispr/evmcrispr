import { BigNumber } from 'ethers';

import { ErrorException } from '../errors';
import type {
  CallExpressionNode,
  CommandExpressionNode,
  HelperFunctionNode,
  NodeInterpreter,
} from '../types';
import { commaListItems } from './formatters';

export enum ComparisonType {
  Between = 'Between',
  Equal = 'Equal',
  Greater = 'Greater',
}

type CallableExpressionNode =
  | CallExpressionNode
  | CommandExpressionNode
  | HelperFunctionNode;

export interface Comparison {
  type: ComparisonType;
  minValue: number;
  maxValue?: number;
}

const checkComparisonError = (
  value: number,
  { type, minValue, maxValue }: Comparison,
): boolean => {
  switch (type) {
    case Equal:
      return value !== minValue;
    case Greater:
      return value < minValue;
    case Between:
      return !!maxValue && !(value >= minValue && value <= maxValue);
  }
};

const { Between, Equal, Greater } = ComparisonType;

export const buildArgsLengthErrorMsg = (
  length: number,
  { type: comparisonType, minValue, maxValue }: Comparison,
): string => {
  let comparisonText = '';

  switch (comparisonType) {
    case Between:
      comparisonText = `between ${minValue} and ${maxValue}`;
      break;
    case Equal:
      comparisonText = minValue.toString();
      break;
    case Greater:
      comparisonText = `at least ${minValue}`;
      break;
  }

  return `invalid number of arguments. Expected ${comparisonText} argument${
    minValue > 1 || maxValue ? 's' : ''
  }, but got ${length}.`;
};

export const checkArgsLength = (
  n: CallableExpressionNode,
  comparison: Comparison,
): void => {
  const argsLength = n.args.length;
  const isError = checkComparisonError(argsLength, comparison);

  if (isError) {
    throw new ErrorException(buildArgsLengthErrorMsg(argsLength, comparison));
  }
};

export const checkOpts = (
  c: CommandExpressionNode,
  validOpts: string[] = [],
): void => {
  const invalidOpts = c.opts
    .filter((o) => !validOpts.includes(o.name))
    .map((o) => o.name);

  if (invalidOpts.length) {
    throw new ErrorException(
      `the following provided options are not defined: ${commaListItems(
        invalidOpts,
      )}`,
    );
  }
};

export const getOptValue = (
  c: CommandExpressionNode,
  optName: string,
  interpretNode: NodeInterpreter,
): Promise<any | undefined> | (any | undefined) => {
  const opt = c.opts.find((o) => o.name === optName);

  if (!opt) {
    return;
  }

  return interpretNode(opt.value);
};

export function isNumberish(number: BigNumber | string): boolean {
  return BigNumber.isBigNumber(number) || /^\d+$/.test(number);
}
