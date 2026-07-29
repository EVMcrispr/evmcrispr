import "../setup";
import { createEthereumJSBackend } from "../../src/lib/ethereumjs-backend";
import { describeBackendSuite } from "./backend-suite";

describeBackendSuite(
  "EthereumJS Backend (unit)",
  "ethereumjs",
  createEthereumJSBackend,
);
