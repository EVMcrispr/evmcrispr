import type { Err } from 'arcsecond';

export const buildParserError = (
  { index, error }: Err<string, null>,
  type: string,
  msg: string,
) => {
  const splitRes = error.split('got');
  const wrongValueEncountered =
    splitRes.length === 2 ? splitRes[1].trim() : null;

  return `${type}(col: ${index}): ${msg}${
    wrongValueEncountered ? `, got ${wrongValueEncountered}` : ''
  }`;
};
