import { ErrorInvalidIdentifier } from "../errors";
import { AppIdentifier, LabeledAppIdentifier } from "../types";

export const SEPARATOR = ":";

export const isAppIdentifier = (identifier: string): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[0-9]{1,63}(?<!-))?$");

  return regex.test(identifier);
};

export const isLabeledAppIdentifier = (identifier: string): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[A-Za-z-]{1,63}(?<!-))?$");

  return regex.test(identifier);
};

export const parseAppIdentifier = (appIdentifier: AppIdentifier): string[] => {
  return appIdentifier.split(SEPARATOR);
};

export const parseLabeledIdentifier = (labeledAppIdentifier: AppIdentifier | LabeledAppIdentifier): string[] => {
  return labeledAppIdentifier.split(SEPARATOR);
};

export const resolveIdentifier = (identifier: string): AppIdentifier | LabeledAppIdentifier => {
  if (isAppIdentifier(identifier)) {
    const [appName, appIndex] = parseAppIdentifier(identifier);

    if (!appIndex) {
      return `${appName}:0`;
    }
    return identifier;
  }
  if (isLabeledAppIdentifier(identifier)) {
    const [_, appLabel] = parseLabeledIdentifier(identifier);

    return appLabel;
  }

  throw new ErrorInvalidIdentifier(identifier);
};
