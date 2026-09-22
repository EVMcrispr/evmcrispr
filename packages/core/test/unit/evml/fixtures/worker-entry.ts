// Test worker: a fresh tag with std, the HTTP/stdin helper, and a helper
// that always raises a declared error, so worker.test.ts can exercise the
// real interpreter -> HelperFunctionError(DeclaredError) -> worker
// postMessage -> deserializeError round trip.
import Http from "@evmcrispr/module-http";
import type { Module } from "@evmcrispr/sdk";
import { defineErrors, defineHelper, defineModule } from "@evmcrispr/sdk";
import { createEvml } from "../../../../src/evml/tag";
import { exposeEvmlWorker } from "../../../../src/worker/expose";

const REFUSE_ERRORS = defineErrors({
  Refused: {
    description: "the helper always refuses",
    fields: [{ name: "code", type: "number" }],
  },
});

const refuse = defineHelper<Module, typeof REFUSE_ERRORS>({
  name: "refuse",
  args: [],
  errors: REFUSE_ERRORS,
  async run(_module, _args, { fail }) {
    // A bigint outside the safe-integer range, to prove bigint fields
    // survive the worker's structured clone untouched.
    fail("Refused", { code: 9007199254740993n }, "refused across the worker");
  },
});

const load = <T>(value: T) => ({ load: async () => ({ default: value }) });

const Declaring = defineModule("declaring", {}, { refuse: load(refuse) }, {});

exposeEvmlWorker(createEvml().use(Http).use(Declaring));
