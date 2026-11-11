import "../setup";
import { createRpcBackend } from "../../src/lib/rpc-backend";
import { describeBackendSuite } from "./backend-suite";

// The node behind the suite's upstream (the test anvil) runs eth_simulateV1.
describeBackendSuite("Rpc Backend (unit)", "rpc", createRpcBackend);
