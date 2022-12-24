import Modal from './ModalCustomization';
import Button from './ButtonCustomization';
import Switch from './SwitchCustomization';
import Alert from './AlertCustomization';
import Tooltip from './TooltipCustomization';

const theme = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
  colors: {
    brand: {
      gray: {
        50: 'rgba(167, 167, 167, 1)',
        100: 'rgba(199, 199, 199, 1)',
        300: 'rgba(82, 82, 82, 1)',
        500: 'rgba(149, 150, 149, 1)',
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
        100: 'rgba(204, 245, 87, 1)',
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
    Alert,
    Tooltip,
  },
  shadows: {
    outline: 'brand.green.900',
  },
};

export default theme;
