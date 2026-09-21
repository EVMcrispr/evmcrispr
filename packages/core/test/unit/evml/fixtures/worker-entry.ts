// Test worker: a fresh tag with std and the HTTP/stdin helper.
import Http from "@evmcrispr/module-http";
import { createEvml } from "../../../../src/evml/tag";
import { exposeEvmlWorker } from "../../../../src/worker/expose";

exposeEvmlWorker(createEvml().use(Http));
