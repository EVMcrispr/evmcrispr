import type { Module } from "../../../src/Module";
import { defineHelper } from "../../../src/utils/defineHelper";
import { VENUE_ERRORS } from "./shared";

export default defineHelper<Module, typeof VENUE_ERRORS>({
  name: "quote",
  description: "A fixture helper that declares errors.",
  returnType: "number",
  args: [],
  errors: VENUE_ERRORS,
  async run(_, __, { fail }) {
    return fail("NoQuote", "the venue declined this token");
  },
});
