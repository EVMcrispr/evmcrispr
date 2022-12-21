import Modal from './ModalCustomization';
import Button from './ButtonCustomization';
import Switch from './SwitchCustomization';

const theme = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
  colors: {
    brand: {
      gray: {
        50: 'rgba(167, 167, 167, 1)',
        300: 'rgba(82, 82, 82, 1)',
        700: 'rgba(18, 18, 18, 1)',
        800: 'rgba(41, 41, 41, 1)',
      },
      green: {
        300: 'rgba(117, 242, 72, 1)', // lime green
        800: 'rgba(37, 104, 12, 1)', // darker green
        900: '#041800',
      },
      warning: {
        50: '#ffe8df',
        300: 'rgba(209, 94, 94, 1)',
        400: '#ed6f2c',
        800: 'rgba(120, 29, 29, 1)',
      },
      blue: {
        600: '#16169d',
        900: '#02071c',
      },
      pink: {
        300: 'rgba(242, 72, 184, 1)',
        800: 'rgba(178, 36, 130, 1)',
      },
      yellow: {
        300: 'rgba(228, 249, 109, 1)',
        800: 'rgba(79, 88, 28, 1)',
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
