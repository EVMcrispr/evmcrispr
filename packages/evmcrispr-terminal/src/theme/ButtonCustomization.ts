import { defineStyle, defineStyleConfig } from '@chakra-ui/styled-system';

const baseStyle = defineStyle({
  borderRadius: 'none', // <-- border radius is same for all variants and sizes
  textDecoration: 'none',
  _hover: {
    transition: 'all 0.5s',
  },
  _focus: {
    boxShadow: '#92ed5e 0px 0px 0px 2px',
  },
  fontWeight: 'normal',
});

const sizes = {
  sm: defineStyle({
    fontSize: 'sm',
    px: 4, // <-- px is short for paddingLeft and paddingRight
    py: 3, // <-- py is short for paddingTop and paddingBottom
  }),
  md: defineStyle({
    fontSize: 'xl',
    px: 6, // <-- these values are tokens from the design system
    py: 4, // <-- these values are tokens from the design system
  }),
  lg: defineStyle({
    fontSize: '2xl',
    px: 6,
    py: 3,
    minWidth: 48,
  }),
};

const blueVariant = defineStyle({
  color: 'brand.green.300',
  bgColor: 'brand.blue.600',
  _hover: {
    bgColor: 'gray.900',
  },
});

const limeVariant = defineStyle({
  color: 'gray.900',
  bgColor: 'brand.green.300',
  _hover: {
    bgColor: 'gray.900',
    color: 'brand.green.300',
  },
});

const warningVariant = defineStyle({
  color: 'brand.warning.50',
  bgColor: 'brand.warning.400',
  _hover: {
    bgColor: 'brand.warning.50',
    color: 'brand.warning.400',
  },
});

const outlineVariant = defineStyle({
  color: 'brand.green.300',
  border: '2px solid',
  borderColor: 'brand.green.300',
  bgColor: 'transparent',

  _hover: {
    bgColor: 'brand.green.300',
    color: 'brand.gray.700',
    border: 'none',
    boxShadow: 'none',
    '& svg': {
      color: 'brand.gray.700',
    },
  },

  _focus: {
    boxShadow: 'none',
  },
});

const overlayVariant = defineStyle((props) => {
  const { colorScheme: c } = props;
  return {
    bgColor: `brand.${c}.300`,
    color: 'brand.gray.700',
    position: 'relative',
    boxSizing: 'border-box',

    _focus: {
      boxShadow: 'none',
    },

    _hover: {
      border: 'none',
      boxShadow: 'none',
      opacity: 0.7,
    },

    '&:before': {
      boxSizing: 'border-box',
      borderRight: '7px solid',
      borderBottom: '7px solid',
      borderColor: `brand.${c}.800`,
      content: '""',
      display: 'block',
      height: '100%',
      position: 'absolute',
      width: '100%',
      top: '7px',
      left: '7px',
    },
  };
});

const iconVariant = defineStyle({
  bgColor: 'brand.gray.800',
  color: 'white',
  position: 'relative',
  boxSizing: 'border-box',
  border: '1px solid',
  borderColor: 'brand.yellow.300',
  fontSize: 'md',
  fontWeight: 700,

  _focus: {
    boxShadow: 'none',
  },

  _hover: {
    border: 'none',
    boxShadow: 'none',
    opacity: 0.7,
  },

  '&:before': {
    boxSizing: 'border-box',
    borderRight: '7px solid',
    borderBottom: '7px solid',
    borderColor: 'brand.gray.300',
    content: '""',
    display: 'block',
    height: '100%',
    position: 'absolute',
    width: '100%',
    top: '8px',
    left: '8px',
  },
});

const buttonTheme = defineStyleConfig({
  baseStyle,
  sizes,
  variants: {
    outline: outlineVariant,
    blue: blueVariant,
    lime: limeVariant,
    warning: warningVariant,
    overlay: overlayVariant,
    icon: iconVariant,
  },
  defaultProps: {
    variant: 'solid',
    size: 'lg',
  },
});

export default buttonTheme;
