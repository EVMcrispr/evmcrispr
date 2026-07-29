/**
 * Base URL of the EVMcrispr API (search + fetch proxy). Override with
 * VITE_EVMCRISPR_API_URL to develop against a local `spin up` instance.
 */
export const EVMCRISPR_API_BASE: string =
  import.meta.env.VITE_EVMCRISPR_API_URL ?? "https://api.evmcrispr.com";
