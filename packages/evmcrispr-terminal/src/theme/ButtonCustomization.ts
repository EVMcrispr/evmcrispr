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

const solidVariant = defineStyle((props) => {
  const { colorScheme: c } = props;
  return {
    bgColor: `brand.${c}.300`,
    color: 'brand.gray.700',

    _focus: {
      boxShadow: 'none',
    },

    _hover: {
      bgColor: `brand.${c}.300 !important`,
      boxShadow: 'none',
      opacity: 0.7,
    },
  };
});

const outlineVariant = defineStyle(() => {
  const activeStyle = {
    bgColor: 'brand.green.300 !important',
    color: 'brand.gray.700',
    boxShadow: 'none',
    '& svg': {
      color: 'brand.gray.700',
    },
  };

  return {
    color: 'brand.green.300',
    border: '2px solid',
    borderColor: 'brand.green.300',
    bgColor: 'transparent',

    _active: activeStyle,
    _visited: activeStyle,
    _focus: activeStyle,

    _disabled: {
      opacity: 0.3,
    },
  };
});

const overlayVariant = defineStyle((props) => {
  const { colorScheme: c } = props;
  const clickedBtn = {
    color: `brand.${c}.300`,
    bgColor: 'black',
    border: '1px solid',
    borderColor: `brand.${c}.300`,
    '&::before': {
      borderColor: `brand.${c}.800 !important`,
      borderRight: '2px solid',
      borderBottom: '2px solid',
      top: '3px',
      left: '3px',
    },
  };

  return {
    bgColor: `brand.${c}.300`,
    color: 'brand.gray.700',
    border: '1px solid',
    borderColor: `brand.${c}.300`,
    position: 'relative',
    boxSizing: 'border-box',

    _disabled: {
      bgColor: 'brand.gray.100',
      borderColor: 'brand.gray.100',

      _before: {
        borderColor: 'brand.gray.500',
      },
    },

    _hover: {
      bgColor: 'black',
      boxShadow: 'none',
      color: `brand.${c}.300`,
      _before: {
        borderColor: `brand.${c}.800 !important`,
        borderRight: '3px solid',
        borderBottom: '3px solid',
        top: '4px',
        left: '4px',
      },

      _disabled: {
        color: 'brand.gray.700',
        bgColor: 'brand.gray.100',
      },
    },

    _active: clickedBtn,

    _visited: clickedBtn,

    _focus: {
      boxShadow: 'none',
      ...clickedBtn,
    },

    _before: {
      boxSizing: 'border-box',
      borderRight: '7px solid',
      borderBottom: '7px solid',
      borderColor: `brand.${c}.800`,
      content: '""',
      display: 'block',
      height: '100%',
      position: 'absolute',
      width: '100%',
      top: '8px',
      left: '8px',
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

  _disabled: {
    bgColor: 'brand.gray.100',
    border: '1px solid',
    borderColor: 'black',
  },

  _hover: {
    boxShadow: 'none',
    bgColor: 'brand.gray.800 !important',
    _before: {
      borderRight: '4px solid',
      borderBottom: '3px solid',
      borderColor: 'brand.gray.300',
      top: '4px',
      left: '5px',
    },

    _disabled: {
      bgColor: 'brand.gray.100 !important',
      border: '1px solid',
      borderColor: 'black',
    },
  },

  _before: {
    boxSizing: 'border-box',
    borderRight: '7px solid',
    borderBottom: '8px solid',
    borderColor: 'brand.gray.300',
    content: '""',
    display: 'block',
    height: '100%',
    position: 'absolute',
    width: '100%',
    top: '9px',
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
    solid: solidVariant,
  },
  defaultProps: {
    variant: 'solid',
    size: 'lg',
  },
});

export default buttonTheme;