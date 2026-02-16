import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { isAddress } from "viem";
import {
  getDAOAppIdentifiers,
  isAppIdentifier,
  isLabeledAppIdentifier,
  parsePrefixedDAOIdentifier,
} from "./utils";

const isRepoIdentifier = (value: string): boolean => {
  const [, rest] = parsePrefixedDAOIdentifier(value);
  return isAppIdentifier(rest) || isLabeledAppIdentifier(rest);
};

export const types: CustomArgTypes = {
  app: {
    validate(name, value) {
      if (!isAddress(value)) {
        throw new ErrorException(
          `${name} must be a valid address, got ${value}`,
        );
      }
    },
    completions(bindingsManager) {
      return getDAOAppIdentifiers(bindingsManager);
    },
  },
  repo: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(
          `${name} must be a string, got ${value}`,
        );
      }
      if (!isRepoIdentifier(value)) {
        throw new ErrorException(
          `${name} must be a valid repo identifier, got ${value}`,
        );
      }
    },
  },
  permission: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(
          `${name} must be a string, got ${value}`,
        );
      }
      if (value.startsWith("0x") && value.length !== 66) {
        throw new ErrorException(
          `${name} must be a valid role hash (bytes32), got ${value}`,
        );
      }
    },
  },
};
