import { isAppIdentifier, parseAppIdentifier } from '../../../utils';

export const formatIdentifier = (possibleIdentifier: string): string => {
  if (isAppIdentifier(possibleIdentifier)) {
    const [, , appIndex] = parseAppIdentifier(possibleIdentifier)!;

    if (!appIndex) {
      return `${possibleIdentifier}:0`;
    }
    return possibleIdentifier;
  }

  return possibleIdentifier;
};
