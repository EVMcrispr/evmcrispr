import "@fontsource/ubuntu-mono";
import {
  Navigate,
  Route,
  RouterProvider,
  createHashRouter,
  createRoutesFromElements,
} from "react-router-dom";
import { ChakraProvider, DarkMode, extendTheme } from "@chakra-ui/react";

import theme from "./theme";
import Wagmi from "./providers/Wagmi";

import Landing from "./pages/Landing";
import Terminal from "./pages/Terminal";
import Fonts from "./theme/Fonts";

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
    <div className="App">
      <ChakraProvider theme={extendTheme(theme)}>
        <Fonts />
        <DarkMode>
          <Wagmi>
            <RouterProvider router={router} />
          </Wagmi>
        </DarkMode>
      </ChakraProvider>
    </div>
  );
};

export default App;
