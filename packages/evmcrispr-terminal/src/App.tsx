import '@fontsource/ubuntu-mono';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ChakraProvider, DarkMode, extendTheme } from '@chakra-ui/react';

import { theme } from './theme';

import Wagmi from './providers/Wagmi';
import Header from './components/header';

import Landing from './pages/landing';
import Terminal from './pages/terminal';

const App = () => {
  return (
    <div className="App">
      <ChakraProvider theme={extendTheme(theme)}>
        <DarkMode>
          <Wagmi>
            <HashRouter>
              <Routes>
                <Route path="/" element={<Header />}>
                  <Route index element={<Landing />} />
                  <Route path="terminal" element={<Terminal />}>
                    <Route path=":hashId" element={<Terminal />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </HashRouter>
          </Wagmi>
        </DarkMode>
      </ChakraProvider>
    </div>
  );
};

export default App;
