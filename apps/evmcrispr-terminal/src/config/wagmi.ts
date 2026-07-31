import { createConfig } from "wagmi";
import { injected, safe, walletConnect } from "wagmi/connectors";

import { chains, transports } from "./rpc";

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const isIframe = window.self !== window.top;

export { transports } from "./rpc";

export const config: ReturnType<typeof createConfig> = createConfig({
  chains,
  connectors: [
    !isIframe && injected(),
    !isIframe &&
      WALLETCONNECT_PROJECT_ID &&
      walletConnect({
        projectId: WALLETCONNECT_PROJECT_ID,
        // Shown by the wallet app on the approval screen, which is all the
        // user sees of us during a mobile deep-link connection.
        metadata: {
          name: "EVMcrispr Terminal",
          description: "Write and run EVM scripts from your browser",
          url: window.location.origin,
          icons: [`${window.location.origin}/logo192.png`],
        },
        showQrModal: false,
      }),
    isIframe &&
      safe({
        allowedDomains: [/app.safe.global$/],
        unstable_getInfoTimeout: 500,
      }),
  ].filter((c): c is Exclude<typeof c, false | "" | undefined> => Boolean(c)),
  transports,
});
