import type { Err } from 'arcsecond';

import type { NodeParserState } from '../parsers/utils';

export const buildParserError = (
  { index, error }: Err<string, null> | Err<string, NodeParserState>,
  type: string,
  msg?: string,
): string => {
  const splitRes = error.split('got');
  const wrongValueEncountered =
    splitRes.length === 2 ? splitRes[1].trim() : null;

  const errorMessage = msg
    ? `${msg}${wrongValueEncountered ? `, got ${wrongValueEncountered}` : ''}`
    : error.split('): ')[1];
  return `${type}(col: ${index}): ${errorMessage}`;
};

export const getIncorrectReceivedValue = (errorMsg: string): string => {
  const splitRes = errorMsg.split('got ');

  if (splitRes.length === 2) {
    return `, got ${splitRes[1].trim()}`;
  }

  return '';
};
