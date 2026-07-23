// Dedicated-worker entry: register the same modules the app sees, then
// serve EVML runs over the worker protocol. Must not import anything that
// touches `window` (wagmi.ts, UI code).
import "virtual:evmcrispr-modules";
import { evml } from "@evmcrispr/core";
import { exposeEvmlWorker } from "@evmcrispr/core/worker";

exposeEvmlWorker(evml);
