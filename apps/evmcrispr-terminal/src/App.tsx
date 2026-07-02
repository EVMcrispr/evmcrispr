import "@fontsource/ubuntu-mono";

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
import { transports } from "./config/wagmi";
import Terminal from "./pages/Terminal";
import Wagmi from "./providers/Wagmi";

const router = createHashRouter(
  createRoutesFromElements(
    <>
      <Route index element={<Terminal />} />
      <Route path=":scriptId" element={<Terminal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
);

const App = () => {
  return (
    <div className="App dark evmcrispr-root">
      <Tooltip.Provider>
        <Wagmi>
          <EvmcrisprProvider evml={evml} transports={transports}>
            <RouterProvider router={router} />
          </EvmcrisprProvider>
        </Wagmi>
      </Tooltip.Provider>
      <Toaster />
    </div>
  );
};

export default App;
