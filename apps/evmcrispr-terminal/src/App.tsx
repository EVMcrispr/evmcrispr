import "@fontsource/ubuntu-mono";

import { Toaster, Tooltip } from "@repo/ui";
import {
  createHashRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from "react-router";
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
