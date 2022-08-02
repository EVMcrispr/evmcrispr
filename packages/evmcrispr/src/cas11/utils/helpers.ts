import { ErrorInvalid } from '../../errors';
import type { Comparison } from './expressions';
import { CallableExpression, ComparisonType } from './expressions';

const { Between, Equal, Greater } = ComparisonType;
const { Helper } = CallableExpression;

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

export const buildArgsLengthErrorMsg = (
  callee: string,
  type: CallableExpression,
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

  return `${
    type === Helper ? '@' : ''
  }${callee} ${type} error: invalid number of arguments. Expected ${comparisonText} argument${
    minValue > 1 || maxValue ? 's' : ''
  }, but got ${length}.`;
};

export const checkArgsLength = (
  name: string,
  type: CallableExpression,
  length: number,
  comparison: Comparison,
): void => {
  const isError = checkComparisonError(length, comparison);

  if (isError) {
    throw new ErrorInvalid(
      buildArgsLengthErrorMsg(name, type, length, comparison),
    );
  }
};
