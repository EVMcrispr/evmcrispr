import type { Module } from "../../../src/Module";
import { defineCommand } from "../../../src/utils/defineCommand";
import { VENUE_ERRORS } from "./shared";

const ERRORS = {
  ...VENUE_ERRORS,
  BelowMinimum: {
    description: "A part is worth less than the minimum",
    fields: [
      {
        name: "minimum",
        type: "number",
        description: "Minimum per part",
      },
    ],
  },
} as const;

export default defineCommand<Module, typeof ERRORS>({
  name: "twap",
  description: "A fixture command that declares errors.",
  args: [{ name: "amount", type: "number" }],
  errors: ERRORS,
  async run(_, { amount }, { fail }) {
    if (amount < 1) {
      fail("BelowMinimum", { minimum: 1n }, "each part is below the minimum");
    }
    return [];
  },
});
