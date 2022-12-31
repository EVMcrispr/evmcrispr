import '@fontsource/ubuntu-mono';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ChakraProvider, DarkMode, extendTheme } from '@chakra-ui/react';

import theme from './theme';

import Wagmi from './providers/Wagmi';

import Landing from './pages/landing';
import Terminal from './pages/terminal';
import Fonts from './theme/Fonts';

const App = () => {
  return (
    <div className="App">
      <ChakraProvider theme={extendTheme(theme)}>
        <Fonts />
        <DarkMode>
          <Wagmi>
            <HashRouter>
              <Routes>
                <Route index element={<Landing />} />
                <Route path="terminal" element={<Terminal />}>
                  <Route path=":scriptId" element={<Terminal />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </HashRouter>
          </Wagmi>
        </DarkMode>
      </ChakraProvider>
    </div>
  );
};

export default App;
