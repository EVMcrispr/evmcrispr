import { version } from '@1hive/evmcrispr/package.json';
import { Link, useLocation } from 'react-router-dom';
import { Stack, Text } from '@chakra-ui/react';

import logo from '../../assets/logo.svg';
import { codename } from '../../assets/sponsors.json';
import { useTerminal } from '../../utils/useTerminal';

const Header = () => {
  const location = useLocation();
  const { onClick } = useTerminal();
  const isTerminal = location.pathname === '/terminal';

  return (
    <Stack
      direction={{ base: 'column', md: isTerminal ? 'row' : 'column' }}
      as="header"
      alignItems={{ base: 'center', md: isTerminal ? 'flex-end' : 'center' }}
      justify="center"
    >
      <Link to="/">
        <img src={logo} alt="Logo" width="262" />
      </Link>
      {location.pathname === '/terminal' ? (
        <Text
          onClick={onClick}
          color="white"
          fontSize="24px"
          border="none"
          cursor="pointer"
          marginLeft={3}
          background="transparent"
          overflow="hidden" // Ensures the content is not revealed until the animation
          borderRight=".5em solid transparent" // The typwriter cursor
          whiteSpace="nowrap" // / Keeps the content on a single line
          letterSpacing=".15em" // Adjust as needed
          width="350px"
          animation="typing 2.5s steps(40, end)"
        >
          {`${codename ? `"${codename}"` : null} v${version}`}
        </Text>
      ) : null}
    </Stack>
  );
};

export default Header;
