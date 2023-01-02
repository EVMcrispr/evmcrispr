import '@fontsource/ubuntu-mono';
import { createHashRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom';

import { ChakraProvider, DarkMode, extendTheme } from '@chakra-ui/react';

import theme from './theme';

import Wagmi from './providers/Wagmi';

import Landing from './pages/landing';
import Terminal from './pages/terminal';
import Fonts from './theme/Fonts';

const App = () => {
  const router = createHashRouter(
    createRoutesFromElements(
      <>
        <Route index element={<Landing />} />
        <Route path="terminal" element={<Terminal />}>
          <Route path=":scriptId" element={<Terminal />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </>
    )
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
