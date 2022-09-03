import type { Err } from 'arcsecond';

import type { NodeParserState } from '../types';

export const buildParserError = (
  { data, error, index }: Err<string, NodeParserState>,
  type: string,
  msg?: string,
): string => {
  const splitRes = error.split('got');
  const wrongValueEncountered =
    splitRes.length === 2 ? splitRes[1].trim() : null;

  const parserMsg = msg
    ? `${msg}${wrongValueEncountered ? `, got ${wrongValueEncountered}` : ''}`
    : error.split('): ')[1];

  return `${type}(${data.line}:${index - data.offset}): ${parserMsg}`;
};

export const getIncorrectReceivedValue = (errorMsg: string): string => {
  const splitRes = errorMsg.split('got ');

  if (splitRes.length === 2) {
    return `, got ${splitRes[1].trim()}`;
  }

  return '';
};
