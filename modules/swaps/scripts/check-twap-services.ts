import { TWAP_CREATION_CHAINS } from "../src/twap/networks";
import { checkTwapService } from "../src/twap/serviceCheck";

// Read-only opt-in release check. Keep live service dependency out of CI.
const evidence = [];
for (const chainId of TWAP_CREATION_CHAINS)
  evidence.push(await checkTwapService(chainId));
console.log(JSON.stringify(evidence, null, 2));
