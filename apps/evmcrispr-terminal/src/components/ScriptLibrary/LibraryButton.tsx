import type { ComponentDefaultProps } from "@chakra-ui/react";
import { Box, Button, Icon } from "@chakra-ui/react";
import type { ElementType, MouseEventHandler } from "react";

type LibraryButtonProps = {
  onClick: MouseEventHandler<HTMLButtonElement>;
  icon: ElementType;
} & ComponentDefaultProps;

export const LibraryButton = ({
  onClick,
  icon,
  ...props
}: LibraryButtonProps) => (
  <Box
    position={"fixed"}
    zIndex={3}
    transform={"rotate(-90deg)"}
    transformOrigin={"bottom right"}
    top={"20vh"}
    right={{ base: "318px", sm: "446px" }}
    {...props}
  >
    <Button
      variant={"outline"}
      color="white"
      colorScheme="green"
      leftIcon={<Icon as={icon} boxSize={6} />}
      size={"md"}
      onClick={onClick}
    >
      Library
    </Button>
  </Box>
);
