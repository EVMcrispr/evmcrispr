import { ErrorInvalid } from "../errors";
import { App, AppIdentifier, LabeledAppIdentifier } from "../types";

const DEFAULT_REGISTRY = "aragonpm.eth";

const appIdentifierRegex = /^((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z-]{1,63}))?(?:\:([0-9]{1,63}))?$/;
const labeledAppIdentifierRegex = /^((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z-]{1,63}))?(?:\:([a-z-]{1,63}))$/;

const parseRegistry = (registryEnsName: string): string => {
  // We denote the default aragonpm registry with an empty string
  // Assume registry is the default one if no ens name is provided.
  if (!registryEnsName) {
    return "";
  }
  const ensParts = registryEnsName.split(".");

  if (ensParts.length === 3) {
    return ensParts[0];
  }

  return "";
};

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
    throw new ErrorInvalid(`Invalid labeled identifier ${labeledAppIdentifier}`, {
      name: "ErrorInvalidIdentifier",
    });
  }

  const [appIdentifier, registry, label] = parseLabeledIdentifier(labeledAppIdentifier)!;

  return [appIdentifier, registry ? `${registry}.aragonpm.eth` : DEFAULT_REGISTRY, label];
};

export const resolveIdentifier = (identifier: string): AppIdentifier | LabeledAppIdentifier => {
  if (isAppIdentifier(identifier)) {
    const [appName, _, appIndex] = parseAppIdentifier(identifier)!;

    if (!appIndex) {
      return `${appName}:0`;
    }
    return identifier;
  }
  if (isLabeledAppIdentifier(identifier)) {
    return identifier;
  }

  throw new ErrorInvalid(`Invalid identifier ${identifier}`, { name: "ErrorInvalidIdentifier" });
};

export const buildAppIdentifier = (app: App, appCounter: number): AppIdentifier => {
  const { name, registryName } = app;
  const parsedRegistryName = parseRegistry(registryName);

  if (parsedRegistryName) {
    return `${name}.${parsedRegistryName}:${appCounter}`;
  } else {
    return `${name}:${appCounter}`;
  }
};
