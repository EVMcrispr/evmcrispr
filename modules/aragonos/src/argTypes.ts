import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem } from "@evmcrispr/sdk";
import type { Address } from "viem";
import { isAddress } from "viem";
import { cloneDao, loadDao } from "./dao";
import { _aragonEns } from "./helpers/aragonEns";
import {
  buildAbiBindings,
  getDAOAppIdentifiers,
  isRepoIdentifier,
} from "./utils";
import {
  getCachedDAO,
  setCachedDAO,
  setCompletionDAO,
} from "./utils/completion";

export const types: CustomArgTypes = {
  dao: {
    validate(name, value) {
      if (typeof value !== "string" && !isAddress(value)) {
        throw new ErrorException(
          `${name} must be a string or address, got ${value}`,
        );
      }
    },
    async resolve(rawValue, ctx) {
      const chainId = ctx.chainId;
      // Check cache first
      const cached = getCachedDAO(ctx.cache, rawValue);
      if (cached) {
        const clonedDAO = cloneDao(cached);
        setCompletionDAO(ctx.bindings, clonedDAO);
        return buildAbiBindings(clonedDAO, chainId);
      }

      // Create DAO
      try {
        let daoAddress: Address;
        if (isAddress(rawValue)) {
          daoAddress = rawValue;
        } else {
          const daoENSName = `${rawValue}.aragonid.eth`;
          const res = await _aragonEns(daoENSName, ctx.client);
          if (!res) return [];
          daoAddress = res;
        }

        const dao = await loadDao(
          daoAddress,
          ctx.client,
          !isAddress(rawValue) ? rawValue : undefined,
        );

        // Cache the DAO
        setCachedDAO(ctx.cache, rawValue, cloneDao(dao));

        // Track DAO for completions
        setCompletionDAO(ctx.bindings, dao);

        return buildAbiBindings(dao, chainId);
      } catch {
        return [];
      }
    },
  },
  app: {
    validate(name, value) {
      if (!isAddress(value)) {
        throw new ErrorException(
          `${name} must be a valid address, got ${value}`,
        );
      }
    },
    completions(ctx) {
      return getDAOAppIdentifiers(ctx.bindings).map(fieldItem);
    },
  },
  repo: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
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
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
      if (value.startsWith("0x") && value.length !== 66) {
        throw new ErrorException(
          `${name} must be a valid role hash (bytes32), got ${value}`,
        );
      }
    },
  },
};
