import { defineStyle, defineStyleConfig } from "@chakra-ui/react";

const warningVariant = defineStyle(() => {
  return {
    color: "white",
    background: "orange.800",
  };
});

// define custom variants
const variants = {
  warning: warningVariant,
};

const baseStyle = {
  background: "green.300",
  borderRadius: "none",
};

const tooltipTheme = defineStyleConfig({
  baseStyle,
  variants,
});

export default tooltipTheme;
