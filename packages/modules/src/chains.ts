/**
 * Chains declared by modules, without pulling in the module registry: a
 * light entry point for hosts that only need network metadata (wallet
 * config, RPC maps, workers).
 */
export { experimentalModuleChains, moduleChains } from "./_generated";
