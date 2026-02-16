import type { Binding, CustomArgTypes } from "@evmcrispr/sdk";
import {
  BindingsSpace,
  ErrorException,
  fieldItem,
  IPFSResolver,
} from "@evmcrispr/sdk";
import type { Address } from "viem";
import { isAddress } from "viem";
import { AragonDAO, isAragonDAO } from "./AragonDAO";
import { _aragonEns } from "./helpers/aragonEns";
import type { App, AppIdentifier } from "./types";
import {
  formatAppIdentifier,
  getDAOAppIdentifiers,
  INITIAL_APP_INDEX,
  isAppIdentifier,
  isLabeledAppIdentifier,
  parsePrefixedDAOIdentifier,
} from "./utils";

const { ABI, ADDR, DATA_PROVIDER } = BindingsSpace;

const isRepoIdentifier = (value: string): boolean => {
  const [, rest] = parsePrefixedDAOIdentifier(value);
  return isAppIdentifier(rest) || isLabeledAppIdentifier(rest);
};

const buildAppBindings = (
  appIdentifier: AppIdentifier,
  app: App,
  _dao: AragonDAO,
): Binding[] => {
  const bindings: Binding[] = [];
  const finalAppIdentifier = formatAppIdentifier(appIdentifier);

  if (appIdentifier.endsWith(INITIAL_APP_INDEX)) {
    bindings.push({
      type: ADDR,
      identifier: appIdentifier,
      value: app.address,
    });
  }

  bindings.push({
    type: ADDR,
    identifier: finalAppIdentifier,
    value: app.address,
  });

  bindings.push({
    type: ABI,
    identifier: app.address,
    value: app.abi,
  });

  if (app.codeAddress) {
    bindings.push({
      type: ABI,
      identifier: app.codeAddress,
      value: app.abi,
    });
  }

  return bindings;
};

const buildDAOBindings = (dao: AragonDAO): Binding[] => {
  const daoBindings: Binding[] = [];

  // DATA_PROVIDER for DAO tracking
  daoBindings.push({
    type: DATA_PROVIDER,
    identifier: dao.name ?? dao.kernel.address,
    value: dao,
  });
  daoBindings.push({
    type: DATA_PROVIDER,
    identifier: "currentDAO",
    value: dao,
  });

  dao.appCache.forEach((app, appIdentifier) => {
    const appBindings = buildAppBindings(appIdentifier, app, dao);
    daoBindings.push(...appBindings);
  });

  return daoBindings;
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
      // Check cache first
      const cached = ctx.cache.getBinding(rawValue, DATA_PROVIDER);
      if (cached?.value && isAragonDAO(cached.value)) {
        const clonedDAO = cached.value.clone();
        return buildDAOBindings(clonedDAO);
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
        ctx.cache.setBinding(rawValue, dao.clone(), DATA_PROVIDER);

        return buildDAOBindings(dao);
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
