import { Link } from 'react-router-dom';
import { codename, version } from '@1hive/evmcrispr/package.json';
import { Box, Flex, HStack, Image, Text } from '@chakra-ui/react';

import logo from '../../assets/logo.svg';

export default function TerminalHeader() {
  return (
    <Flex justify={'space-between'}>
      <HStack spacing={6} align={'flex-end'}>
        <Link to="/">
          <Image src={logo} alt="Logo" width={52} />
        </Link>
        <HStack bgColor={'brand.darkGray'}>
          <Box w={'6px'} h={9} bgColor={'brand.green.300'} />
          <Text
            pl={2}
            color="white"
            fontSize="24px"
            border="none"
            cursor="pointer"
            marginLeft={3}
            background="transparent"
            overflow="hidden" // Ensures the content is not revealed until the animation
            borderRight=".5em solid transparent" // The typwriter cursor
            whiteSpace="nowrap" // / Keeps the content on a single line
            letterSpacing=".12em" // Adjust as needed
            width="28rem"
            animation="typing 2.5s steps(40, end)"
          >
            {`${codename ? ` "${codename}"` : null} v${version}`}
          </Text>
        </HStack>
      </HStack>
    </Flex>
  );
}
