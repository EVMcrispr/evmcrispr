import "../setup";
import { createRevmBackend } from "../../src/lib/revm-backend";
import { describeBackendSuite } from "./backend-suite";

describeBackendSuite("Revm Backend (unit)", "revm", createRevmBackend);
