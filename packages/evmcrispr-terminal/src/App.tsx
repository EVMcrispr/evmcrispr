import '@fontsource/ubuntu-mono';
import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';

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
              <Header />
              <Switch>
                <Route exact path="/terminal" render={() => <Terminal />} />
                <Route exact path="/" render={() => <Landing />} />
                <Redirect to="/" />
              </Switch>
            </HashRouter>
          </Wagmi>
        </DarkMode>
      </ChakraProvider>
    </div>
  );
};

export default App;
