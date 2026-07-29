import { ErrorInvalid } from "@evmcrispr/sdk";

const DEFAULT_REGISTRY = "aragonpm.eth";

// App name optionally qualified by a registry prefix (e.g. `vault`, `voting.open`).
export const repoIdentifierRegex =
  /^((?!-)[a-z0-9-]{1,63}(?<!-))(?:\.([a-z0-9-]{1,63}))?$/;

export const isRepoIdentifier = (identifier: string): boolean => {
  return !!identifier && repoIdentifierRegex.test(identifier);
};

export const parseRepoIdentifier = (
  identifier: string,
): [appName: string, registryEns: string] => {
  const res = repoIdentifierRegex.exec(identifier);

  if (!res) {
    throw new ErrorInvalid(`invalid repo identifier ${identifier}`, {
      name: "ErrorInvalidIdentifier",
    });
  }

  const [, appName, registry] = res;

  return [
    appName,
    registry ? `${registry}.${DEFAULT_REGISTRY}` : DEFAULT_REGISTRY,
  ];
};

export const parseRegistry = (registryEnsName: string): string => {
  // We denote the default aragonpm registry with an empty string
  // Assume registry is the default one if no ens name is provided.
  if (!registryEnsName) {
    return "";
  }
  const ensParts = registryEnsName.split(".");

  if (ensParts.length === 3) {
    return `.${ensParts[0]}`;
  }

  return "";
};

/** Display name of an app: its name plus a registry qualifier when not on aragonpm.eth. */
export const appDisplayName = (name: string, registryName: string): string =>
  `${name}${parseRegistry(registryName)}`;
