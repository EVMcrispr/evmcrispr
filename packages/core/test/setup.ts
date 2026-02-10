import { EVMcrispr } from "../src/EVMcrispr";
import { server } from "./fixtures/server.js";

// Register modules available during tests
EVMcrispr.registerModule(
  "aragonos",
  () => import("@evmcrispr/module-aragonos"),
);
EVMcrispr.registerModule("sim", () => import("@evmcrispr/module-sim"));
EVMcrispr.registerModule("giveth", () => import("@evmcrispr/module-giveth"));
EVMcrispr.registerModule("ens", () => import("@evmcrispr/module-ens"));

server.listen({
  onUnhandledRequest: "bypass",
});
