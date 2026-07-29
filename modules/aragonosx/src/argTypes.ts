import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem } from "@evmcrispr/sdk";
import { isAddress } from "viem";
import { isPluginSubdomain } from "./dao";
import { DAO_PERMISSIONS } from "./utils/permissions";

export const types: CustomArgTypes = {
  dao: {
    validate(name, value) {
      if (typeof value !== "string" && !isAddress(value)) {
        throw new ErrorException(
          `${name} must be a string or address, got ${value}`,
        );
      }
    },
  },
  plugin: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
      if (!isAddress(value) && !isPluginSubdomain(value)) {
        throw new ErrorException(
          `${name} must be a plugin identifier or address, got ${value}`,
        );
      }
    },
    completions() {
      return [
        "admin",
        "multisig",
        "token-voting",
        "staged-proposal-processor",
      ].map(fieldItem);
    },
  },
  repo: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
    },
    completions() {
      return [
        "admin",
        "multisig",
        "token-voting",
        "staged-proposal-processor",
      ].map(fieldItem);
    },
  },
  permission: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
      if (value.startsWith("0x") && value.length !== 66) {
        throw new ErrorException(
          `${name} must be a valid permission id (bytes32), got ${value}`,
        );
      }
    },
    completions() {
      return DAO_PERMISSIONS.map((p) =>
        fieldItem(p.replace(/_PERMISSION$/, "")),
      );
    },
  },
};
