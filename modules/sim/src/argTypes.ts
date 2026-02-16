import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem } from "@evmcrispr/sdk";

const SIMULATION_MODES = ["anvil", "hardhat", "tenderly"] as const;

export const types: CustomArgTypes = {
  "simulation-mode": {
    validate(name, value) {
      if (
        typeof value !== "string" ||
        !SIMULATION_MODES.includes(value as any)
      ) {
        throw new ErrorException(
          `${name} must be one of ${SIMULATION_MODES.join(", ")}, got ${value}`,
        );
      }
    },
    completions() {
      return SIMULATION_MODES.map((m) => fieldItem(m));
    },
  },
};
