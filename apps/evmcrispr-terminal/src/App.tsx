import "@fontsource/jetbrains-mono";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource-variable/instrument-sans";

import { evml } from "@evmcrispr/core";
import { EvmcrisprProvider } from "@evmcrispr/editor";
import { Toaster, Tooltip } from "@repo/ui";
import {
  createHashRouter,
  createRoutesFromElements,
  Navigate,
  Route,
} from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppProvider } from "./app/AppContext";
import type { App as AppObject } from "./app/boot";
import { RouteError } from "./app/Crash";
import Terminal from "./app/Terminal";
import { AssistantProvider } from "./assistant/AssistantProvider";
import { transports } from "./config/wagmi";
import Wagmi from "./providers/Wagmi";
import { WalletProvider } from "./wallet/WalletContext";

const router = createHashRouter(
  createRoutesFromElements(
    <Route errorElement={<RouteError />}>
      <Route index element={<Terminal />} />
      <Route path=":scriptId" element={<Terminal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);

const App = ({ app }: { app: AppObject }) => {
  return (
    <div className="App dark evmcrispr-root">
      <Tooltip.Provider>
        <Wagmi>
          <AppProvider app={app}>
            <EvmcrisprProvider evml={evml} transports={transports}>
              <WalletProvider>
                <AssistantProvider>
                  <RouterProvider router={router} />
                </AssistantProvider>
              </WalletProvider>
            </EvmcrisprProvider>
          </AppProvider>
        </Wagmi>
      </Tooltip.Provider>
      <Toaster />
    </div>
  );
};

export default App;
