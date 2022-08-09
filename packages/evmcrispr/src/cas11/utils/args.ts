import { Interpreter } from '../interpreter/Interpreter';
import type { CallableExpressionNode } from '../types';

export enum ComparisonType {
  Between = 'Between',
  Equal = 'Equal',
  Greater = 'Greater',
}

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
    Interpreter.panic(n, buildArgsLengthErrorMsg(argsLength, comparison));
  }
};
