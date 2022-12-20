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
      gray: 'rgba(82, 82, 82, 1)',
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
