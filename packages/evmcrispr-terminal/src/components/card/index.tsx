import { Box, Center, Text } from '@chakra-ui/react';
import styled from '@emotion/styled';

import Trail from '../animations/trail';

const CardWrapper = styled(Box)`
  & > div span:nth-child(1) {
    top: -5px;
    right: -5px;
  }

  & > div span:nth-child(2) {
    bottom: -5px;
    right: -5px;
  }

  & > div span:nth-child(3) {
    top: -5px;
    left: -5px;
  }

  & > div span:nth-child(4) {
    bottom: -5px;
    left: -5px;
  }
`;

type CardProps = {
  image: any;
  height?: number;
  name: string;
  info: string;
  description: string;
  showContent?: boolean;
};

const Pixels = () => (
  <>
    <Box
      background="black"
      position="absolute"
      height={2}
      width={2}
      as="span"
    ></Box>
    <Box
      background="black"
      position="absolute"
      height={2}
      width={2}
      as="span"
    ></Box>
    <Box
      background="black"
      position="absolute"
      height={2}
      width={2}
      as="span"
    ></Box>
    <Box
      background="black"
      position="absolute"
      height={2}
      width={2}
      as="span"
    ></Box>
  </>
);

const Card = ({
  image,
  height = 130,
  name,
  info,
  description,
  showContent,
}: CardProps) => {
  return (
    <CardWrapper width="255px" position="relative">
      <Box
        minHeight="470"
        padding={6}
        textAlign="center"
        border="4px solid"
        borderColor="green.300"
        backgroundColor="black"
        zIndex="10"
        position="relative"
      >
        <Pixels />
        <Center
          as={Trail}
          open={showContent}
          overflow="hidden"
          gap={2}
          flexDirection="column"
        >
          <Box height="160">
            <img src={image} alt={name} style={{ height }} />
          </Box>
          <Text fontSize="15px" color="green.300" fontWeight="bold">
            {name}
          </Text>
          <Text fontSize="15px" fontWeight="bold">
            {info}
          </Text>
          <Text fontSize="13px">{description}</Text>
        </Center>
      </Box>
      <Box
        position="absolute"
        inset="0"
        transform="translate(25px, 25px)"
        border="4px solid"
        borderColor="green.300"
      >
        <Pixels />
      </Box>
    </CardWrapper>
  );
};

export default Card;
