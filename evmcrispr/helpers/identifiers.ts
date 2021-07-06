import { ErrorInvalidIdentifier } from "../errors";
import { AppIdentifier, LabeledAppIdentifier, LabeledAppRegistryIdentifier } from "../types";

export const DEFAULT_REGISTRY = "aragonpm.eth";

export const SEPARATOR = ":";

export const isAppIdentifier = (identifier: string): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[0-9]{1,63}(?<!-))?$");

  return regex.test(identifier);
};

export const isLabeledAppIdentifier = (identifier: string): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[A-Za-z-]{1,63}(?<!-))?$");

  return regex.test(identifier);
};

export const isLabeledAppRegistryIdentifier = (identifier: string): boolean => {
  const regex = new RegExp("^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(:(?!-)[A-Za-z-]{1,63}(?<!-))?.(?!-)[a-z-]{1,20}(?<!-)$");

  return regex.test(identifier);
};

export const parseAppIdentifier = (appIdentifier: AppIdentifier): string[] => {
  return appIdentifier.split(SEPARATOR);
};

export const parseLabeledIdentifier = (labeledAppIdentifier: AppIdentifier | LabeledAppIdentifier): string[] => {
  return labeledAppIdentifier.split(SEPARATOR);
};

export const parseLabeledAppRegistryIdentifier = (
  labeledAppRegistryIdentifier: LabeledAppRegistryIdentifier
): string[] => {
  const [labeledAppIdentifier, registry] = labeledAppRegistryIdentifier.split(".");

  return [...parseLabeledIdentifier(labeledAppIdentifier), registry ? `${registry}.aragonpm.eth` : DEFAULT_REGISTRY];
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
