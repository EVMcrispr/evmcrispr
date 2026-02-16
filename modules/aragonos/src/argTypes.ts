import type { Binding, CustomArgTypes } from "@evmcrispr/sdk";
import {
  abiBindingKey,
  BindingsSpace,
  ErrorException,
  fieldItem,
  IPFSResolver,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { isAddress } from "viem";
import { AragonDAO } from "./AragonDAO";
import { _aragonEns } from "./helpers/aragonEns";
import type { App } from "./types";
import {
  getDAOAppIdentifiers,
  isAppIdentifier,
  isLabeledAppIdentifier,
  parsePrefixedDAOIdentifier,
} from "./utils";
import {
  getCachedDAO,
  pushCompletionDAO,
  setCachedDAO,
} from "./utils/completion";

const { ABI } = BindingsSpace;

const isRepoIdentifier = (value: string): boolean => {
  const [, rest] = parsePrefixedDAOIdentifier(value);
  return isAppIdentifier(rest) || isLabeledAppIdentifier(rest);
};

const buildAbiBindings = (dao: AragonDAO, chainId: number): Binding[] => {
  const bindings: Binding[] = [];
  const seen = new Set<string>();

  dao.appCache.forEach((app) => {
    const addrKey = abiBindingKey(chainId, app.address);
    if (!seen.has(addrKey)) {
      seen.add(addrKey);
      bindings.push({ type: ABI, identifier: addrKey, value: app.abi });
    }

    if (app.codeAddress) {
      const codeKey = abiBindingKey(chainId, app.codeAddress);
      if (!seen.has(codeKey)) {
        seen.add(codeKey);
        bindings.push({
          type: ABI,
          identifier: codeKey,
          value: app.abi,
        });
      }
    }
  });

  return bindings;
};

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
        const clonedDAO = cached.clone();
        pushCompletionDAO(ctx.bindings, clonedDAO);
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

        const ipfsResolver = new IPFSResolver();
        const dao = await AragonDAO.create(
          daoAddress,
          ctx.client,
          ipfsResolver,
          1,
          !isAddress(rawValue) ? rawValue : undefined,
        );

        // Cache the DAO
        setCachedDAO(ctx.cache, rawValue, dao.clone());

        // Track DAO for completions
        pushCompletionDAO(ctx.bindings, dao);

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
