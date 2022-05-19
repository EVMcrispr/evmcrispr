import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';

import { ChakraProvider, extendTheme } from '@chakra-ui/react';

import Wagmi from './providers/Wagmi';
import Header from './components/header';

import Landing from './pages/landing';
import Terminal from './pages/terminal';

const theme = extendTheme({
  colors: {
    brand: {
      900: '#1a365d',
      800: '#153e75',
      700: '#2a69ac',
      green: '#75f248',
      btn: {
        bg: 'rgba(24, 24, 171, 1)',
        color: 'rgba(223, 251, 79, 1)',
      },
    },
  },
  fonts: {
    heading: 'Ubuntu Mono, monospace',
    body: 'Ubuntu Mono, monospace',
  },
});

const App = () => {
  return (
    <div className="App">
      <ChakraProvider theme={theme}>
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
      </ChakraProvider>
    </div>
  );
};

export default App;
