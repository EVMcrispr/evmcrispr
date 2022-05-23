import '@fontsource/ubuntu-mono';
import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';

import type { ComponentStyleConfig } from '@chakra-ui/react';
import { ChakraProvider, DarkMode, extendTheme } from '@chakra-ui/react';

import Wagmi from './providers/Wagmi';
import Header from './components/header';

import Landing from './pages/landing';
import Terminal from './pages/terminal';

const Modal: ComponentStyleConfig = {
  // The styles all button have in common
  parts: ['dialog'],
  baseStyle: {
    dialog: {
      bg: 'black',
      border: '3px solid #75f248',
    },
  },
};

const Button: ComponentStyleConfig = {
  // The styles all button have in common
  baseStyle: {
    borderRadius: 'base', // <-- border radius is same for all variants and sizes
  },
  // Two sizes: sm and md
  sizes: {
    sm: {
      fontSize: 'sm',
      px: 4, // <-- px is short for paddingLeft and paddingRight
      py: 3, // <-- py is short for paddingTop and paddingBottom
    },
    md: {
      fontSize: 'md',
      px: 6, // <-- these values are tokens from the design system
      py: 4, // <-- these values are tokens from the design system
    },
  },
  // Two variants: outline and solid
  variants: {
    outline: {
      border: '2px solid',
      borderColor: '#75f248',
      color: '#75f248',
    },
    solid: {
      bg: '#75f248',
      color: 'white',
    },
  },
  // The default size and variant values
  defaultProps: {
    size: 'md',
    variant: 'outline',
  },
};

const theme = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
  colors: {
    brand: {
      900: '#1a365d',
      800: '#153e75',
      700: '#2a69ac',
      green: 'rgba(150, 238, 100, 1)',
      btn: {
        bg: 'rgba(24, 24, 171, 1)',
        color: 'rgba(223, 251, 79, 1)',
        hover: '#121212',
        warning: '#ed702d',
      },
    },
  },
  fonts: {
    heading: 'Ubuntu Mono, monospace, sans-serif',
    body: 'Ubuntu Mono, monospace, sans-serif',
  },
  components: {
    Modal,
    Button,
  }
};

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
