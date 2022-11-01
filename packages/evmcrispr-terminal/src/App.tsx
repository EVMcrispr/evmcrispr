import '@fontsource/ubuntu-mono';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

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
      border: '3px solid',
      borderColor: 'brand.green.300',
    },
  },
};

const Button: ComponentStyleConfig = {
  // The styles all button have in common
  baseStyle: {
    borderRadius: 'none', // <-- border radius is same for all variants and sizes
    textDecoration: 'none',
    _hover: {
      transition: 'all 0.5s',
    },
    _focus: {
      boxShadow: 'rgba(66, 153, 225, 0.6) 0px 0px 0px 2px',
    },
    fontWeight: 'normal',
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
    lg: {
      fontSize: '2xl',
      px: 6,
      py: 3,
    },
  },
  // Two variants: outline and solid
  variants: {
    outline: {
      border: '2px solid',
      borderColor: 'brand.green.300',
      color: 'brand.green.300',
    },
    blue: {
      color: 'brand.green.300',
      bgColor: 'brand.blue.600',
      _hover: {
        bgColor: 'gray.900',
      },
    },
    lime: {
      color: 'gray.900',
      bgColor: 'brand.green.300',
      _hover: {
        bgColor: 'gray.900',
        color: 'brand.green.300',
      },
    },
    warning: {
      color: 'brand.warning.50',
      bgColor: 'brand.warning.400',
      _hover: {
        bgColor: 'brand.warning.50',
        color: 'brand.warning.400',
      },
    },
  },
  // The default size and variant values
  defaultProps: {
    variant: 'solid',
    size: 'lg',
  },
};

const theme = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
  colors: {
    brand: {
      green: {
        300: '#92ed5e',
        900: '#041800',
      },
      warning: {
        50: '#ffe8df',
        400: '#ed6f2c',
      },
      blue: {
        600: '#16169d',
        900: '#02071c',
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
  },
};

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
