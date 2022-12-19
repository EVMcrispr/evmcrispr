import Modal from './ModalCustomization';
import Button from './ButtonCustomization';
import Switch from './SwitchCustomization';

const theme = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
  colors: {
    brand: {
      dark: 'rgba(18, 18, 18, 1)',
      darkGray: 'rgba(41, 41, 41, 1)',
      green: {
        300: 'rgba(117, 242, 72, 1)', // lime green
        800: 'rgba(37, 104, 12, 1)', // darker green
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
      pink: {
        300: 'rgba(242, 72, 184, 1)',
        800: 'rgba(178, 36, 130, 1)',
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
    Switch,
  },
  shadows: {
    outline: 'brand.green.900',
  },
};

export default theme;
