import type { Address } from "@evmcrispr/sdk";
import type { AppResource } from "./app";

/** @internal */
export type AppResourceCache = Map<Address, AppResource>;
