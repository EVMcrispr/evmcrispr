import { modalAnatomy as parts } from '@chakra-ui/anatomy';
import {
  createMultiStyleConfigHelpers,
  defineStyle,
} from '@chakra-ui/styled-system';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(parts.keys);

const baseStyle = definePartsStyle((props) => {
  const { colorScheme: c } = props;
  return {
    header: {
      color: `brand.${c}.300`,
      borderBottom: '2px solid',
      borderColor: `brand.${c}.300`,
    },
    closeButton: {
      color: `brand.${c}.300`,
    },
    dialog: {
      bgColor: 'black',
      border: '2px solid',
      borderColor: `brand.${c}.300`,
      borderRadius: 'none',

      '&:before': {
        boxSizing: 'border-box',
        borderRight: '10px solid',
        borderBottom: '10px solid',
        borderColor: `brand.${c}.800`,
        content: '""',
        display: 'block',
        position: 'absolute',
      },
    },
    body: {
      w: 'full',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },
  };
});

const headerBase = defineStyle({
  fontSize: 'lg',
  p: 4,
  lineHeight: 'base',
  fontWeight: 700,
  w: 'full',
});

const mdDialog = defineStyle({
  h: '2xs',
  fontSize: 'md',
  lineHeight: 'base',

  '&:before': {
    h: '2xs',
    w: 'full',
    top: '9px',
    left: '13px',
  },
});

const lgDialog = defineStyle({
  w: '2xl',
  maxW: 'unset',
  fontSize: '2xl',
  lineHeight: 'base',
  '&:before': {
    w: '2xl',
    h: 'full',
    top: '13px',
    left: '9px',
  },
});

const xlDialog = defineStyle({
  maxW: 'unset',
  w: '4xl',
  h: 'lg',
  fontSize: '2xl',
  lineHeight: 'base',
  '&:before': {
    maxW: 'unset',
    w: '4xl',
    h: 'lg',
    top: '9px',
    left: '9px',
  },
});

const xlBody = defineStyle({
  w: 'full',
  h: 'full',
});

const lgBody = defineStyle({
  py: 8,
});

const mdBody = defineStyle({
  px: 10,
});

const sizes = {
  xl: definePartsStyle({ header: headerBase, dialog: xlDialog, body: xlBody }),
  lg: definePartsStyle({ header: headerBase, dialog: lgDialog, body: lgBody }),
  md: definePartsStyle({ header: headerBase, dialog: mdDialog, body: mdBody }),
};

const modalTheme = defineMultiStyleConfig({
  baseStyle,
  sizes,
  defaultProps: {
    size: 'md',
  },
});

export default modalTheme;
