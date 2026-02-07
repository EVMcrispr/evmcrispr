import "@fontsource/ubuntu-mono";
import {
  Navigate,
  Route,
  RouterProvider,
  createHashRouter,
  createRoutesFromElements,
} from "react-router-dom";

import { Tooltip } from "@/components/retroui/Tooltip";
import { Toaster } from "@/components/retroui/Sonner";

import Wagmi from "./providers/Wagmi";

import Landing from "./pages/Landing";
import Terminal from "./pages/Terminal";

const App = () => {
  const router = createHashRouter(
    createRoutesFromElements(
      <>
        <Route index element={<Landing />} />
        <Route path="terminal" element={<Terminal />}>
          <Route path=":scriptId" element={<Terminal />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </>,
    ),
  );
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
