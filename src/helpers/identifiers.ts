import { ErrorInvalidIdentifier } from "../errors";
import { AppIdentifier, LabeledAppIdentifier } from "../types";

const DEFAULT_REGISTRY = "aragonpm.eth";

const appIdentifierRegex = /^((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z-]{1,63}))?(?:\:([0-9]{1,63}))?$/;
const labeledAppIdentifierRegex = /^((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z-]{1,63}))?(?:\:([a-z-]{1,63}))?$/;

export const isAppIdentifier = (identifier: string): boolean => {
  return appIdentifierRegex.test(identifier);
};

export const isLabeledAppIdentifier = (identifier: string): boolean => {
  return labeledAppIdentifierRegex.test(identifier);
};

export const parseAppIdentifier = (appIdentifier: AppIdentifier): string[] | undefined => {
  return appIdentifierRegex.exec(appIdentifier)?.slice(1);
};

export const parseLabeledIdentifier = (labeledAppIdentifier: LabeledAppIdentifier): string[] | undefined => {
  return labeledAppIdentifierRegex.exec(labeledAppIdentifier)?.slice(1);
};

export const parseLabeledAppIdentifier = (labeledAppIdentifier: LabeledAppIdentifier): string[] => {
  if (!isLabeledAppIdentifier(labeledAppIdentifier)) {
    throw new ErrorInvalidIdentifier(labeledAppIdentifier);
  }

  const [appIdentifier, registry, label] = parseLabeledIdentifier(labeledAppIdentifier)!;

  return [appIdentifier, registry ? `${registry}.aragonpm.eth` : DEFAULT_REGISTRY, label];
};

export const resolveIdentifier = (identifier: string): AppIdentifier | LabeledAppIdentifier => {
  if (isAppIdentifier(identifier)) {
    const [appName, appIndex] = parseAppIdentifier(identifier)!;

    if (!appIndex) {
      return `${appName}:0`;
    }
    return identifier;
  }
  if (isLabeledAppIdentifier(identifier)) {
    return identifier;
  }

  throw new ErrorInvalidIdentifier(identifier);
};
