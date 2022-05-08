import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';

import { ChakraProvider, extendTheme } from '@chakra-ui/react';

import Wagmi from './providers/Wagmi';

import Footer from './components/footer';
import Header from './components/header';

import Landing from './pages/landing';
import Terminal from './pages/terminal';

const colors = {
  brand: {
    900: '#1a365d',
    800: '#153e75',
    700: '#2a69ac',
  },
};

const theme = extendTheme({ colors });

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
            <Footer />
          </HashRouter>
        </Wagmi>
      </ChakraProvider>
    </div>
  );
};

export default App;
