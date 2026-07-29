import type { Binding } from "@evmcrispr/sdk";
import { abiBindingKey, BindingsSpace } from "@evmcrispr/sdk";
import type { DaoContext } from "../dao";

const { ABI } = BindingsSpace;

export const buildAbiBindings = (
  dao: DaoContext,
  chainId: number,
): Binding[] => {
  const bindings: Binding[] = [];
  const seen = new Set<string>();

  dao.apps.forEach((app) => {
    const addrKey = abiBindingKey(chainId, app.address);
    if (!seen.has(addrKey)) {
      seen.add(addrKey);
      bindings.push({ type: ABI, identifier: addrKey, value: app.abi });
    }

    const codeKey = abiBindingKey(chainId, app.codeAddress);
    if (!seen.has(codeKey)) {
      seen.add(codeKey);
      bindings.push({ type: ABI, identifier: codeKey, value: app.abi });
    }
  });

  return bindings;
};
