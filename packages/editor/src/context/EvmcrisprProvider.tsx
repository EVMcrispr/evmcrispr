import type { EvmlConfig, EvmlTag, ModuleInput } from "@evmcrispr/core";
import { createEvml, evml } from "@evmcrispr/core";
import { createContext, type ReactNode, useContext, useMemo } from "react";

const EvmcrisprContext = createContext<EvmlTag>(evml);

export interface EvmcrisprProviderProps {
  /** Pre-configured tag (e.g. the app's global `evml` with modules already
   *  registered). Defaults to an isolated tag when `modules` are given,
   *  otherwise to the global `evml` singleton. */
  evml?: EvmlTag;
  /** Modules to register. Registered on an isolated registry unless an
   *  explicit `evml` tag is provided. */
  modules?: ModuleInput[];
  /** Viem transports per chain id. Defaults to public RPC endpoints. */
  transports?: EvmlConfig["transports"];
  chainId?: number;
  account?: EvmlConfig["account"];
  children: ReactNode;
}

/**
 * Provides the `EvmlTag` every editor/viewer/console component under it
 * uses for parsing, LSP lookups and interpretation. Optional — without a
 * provider, components fall back to the global `evml` singleton.
 */
export function EvmcrisprProvider({
  evml: tagProp,
  modules,
  transports,
  chainId,
  account,
  children,
}: EvmcrisprProviderProps) {
  const tag = useMemo(() => {
    let tag = tagProp ?? (modules?.length ? createEvml() : evml);
    if (modules?.length) tag = tag.use(...modules);

    const config: EvmlConfig = {};
    if (transports) config.transports = transports;
    if (chainId != null) config.chainId = chainId;
    if (account) config.account = account;
    return Object.keys(config).length > 0 ? tag.with(config) : tag;
  }, [tagProp, modules, transports, chainId, account]);

  return (
    <EvmcrisprContext.Provider value={tag}>
      {children}
    </EvmcrisprContext.Provider>
  );
}

/** The `EvmlTag` provided by the nearest `EvmcrisprProvider`, or the
 *  global `evml` singleton when there is none. */
export function useEvmlTag(): EvmlTag {
  return useContext(EvmcrisprContext);
}
