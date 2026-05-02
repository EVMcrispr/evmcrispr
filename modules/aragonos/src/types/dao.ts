import type { Address } from "@evmcrispr/sdk";
import type {
  App,
  AppIdentifier,
  AppResource,
  LabeledAppIdentifier,
} from "./app";

/** @internal */
export type AppResourceCache = Map<Address, AppResource>;

/**
 * A map which contains the DAO's apps indexed by their identifier ([[AppIdentifier]] or [[LabeledAppIdentifier]]).
 */
export type AppCache = Map<AppIdentifier | LabeledAppIdentifier, App>;
