import "@fontsource/ubuntu-mono";
import {
  Navigate,
  Route,
  RouterProvider,
  createHashRouter,
  createRoutesFromElements,
} from "react-router-dom";

import { Toaster, Tooltip } from "@repo/ui";

import Wagmi from "./providers/Wagmi";

import Terminal from "./pages/Terminal";

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
    <div className="App dark">
      <Tooltip.Provider>
        <Wagmi>
          <RouterProvider router={router} />
        </Wagmi>
      </Tooltip.Provider>
      <Toaster />
    </div>
  );
};

export default App;
