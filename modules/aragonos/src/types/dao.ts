import type { Address } from '@1hive/evmcrispr';

import type {
  App,
  AppArtifact,
  AppIdentifier,
  LabeledAppIdentifier,
} from './app';

/** @internal */
export type AppArtifactCache = Map<Address, AppArtifact>;

/**
 * A map which contains the DAO's apps indexed by their identifier ([[AppIdentifier]] or [[LabeledAppIdentifier]]).
 */
export type AppCache = Map<AppIdentifier | LabeledAppIdentifier, App>;
