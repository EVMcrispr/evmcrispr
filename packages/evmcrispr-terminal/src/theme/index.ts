import Modal from './ModalCustomization';
import Button from './ButtonCustomization';
import Switch from './SwitchCustomization';

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
    Switch,
  },
  shadows: {
    outline: 'brand.green.900',
  },
};

export default theme;
