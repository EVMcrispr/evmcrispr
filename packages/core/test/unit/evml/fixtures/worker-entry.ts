// Test worker: a fresh evml tag (std only) served over the worker protocol.
import { createEvml } from "../../../../src/evml/tag";
import { exposeEvmlWorker } from "../../../../src/worker/expose";

exposeEvmlWorker(createEvml());
