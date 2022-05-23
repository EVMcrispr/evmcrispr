import { Center, Heading, Link, Stack, Text, VStack } from '@chakra-ui/react';

import giveth from '../../assets/giveth.svg';
import OneHive from '../../assets/1hive.svg';
import curve from '../../assets/curve.svg';
import nftx from '../../assets/nftx.svg';
import aragon from '../../assets/aragon.svg';

export const AragonSponsor = () => {
  return (
    <Center
      py={20}
      background="repeating-linear-gradient(45deg,#000,#000 20px,#111 20px,#111 40px)"
      borderY="2px solid"
      borderColor="brand.green.300"
    >
      <Stack
        direction={{ base: 'column', md: 'row', lg: 'row' }}
        spacing={6}
        border="2px solid"
        borderColor="transparent"
        py={20}
        className="box"
        minWidth="55%"
        align="center"
        justify="center"
      >
        <Text color="brand.green.300" size="md">
          Sponsored by
        </Text>
        <Link isExternal href="https://aragon.org/" paddingX={20}>
          <img src={aragon} alt="Aragon" />
        </Link>
      </Stack>
    </Center>
  );
};

const sponsors = [
  {
    link: 'https://1hive.org/',
    src: OneHive,
    name: '1hive',
  },
  {
    link: 'https://giveth.io',
    src: giveth,
    name: 'Giveth',
  },
  {
    link: 'https://nftx.io/',
    src: nftx,
    name: 'NFTX',
  },
  {
    link: 'https://curve.fi/',
    src: curve,
    name: 'Curve',
  },
];

export const AllSponsors = () => {
  return (
    <Center bgColor="rgba(24, 24, 24, 1)" p={14} as="section">
      <VStack spacing={12}>
        <Heading
          as="h2"
          color="brand.green.300"
          size="md"
          textAlign="center"
          css={{ fontFamily: 'Ubuntu Mono' }}
        >
          <strong>EVMcrispr</strong> would have not been possible without the
          support of:
        </Heading>
        <Stack
          direction={{ base: 'column', md: 'column', lg: 'row' }}
          justify="space-between"
          align="center"
          width={{ md: '956px' }}
        >
          {sponsors.map(({ src, link, name }, i) => (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              key={`sponsors-link-${i}`}
            >
              <VStack spacing={10} marginBottom={45}>
                <img src={src} alt={name} />
                <Text color="white">{name}</Text>
              </VStack>
            </a>
          ))}
        </Stack>
      </VStack>
    </Center>
  );
};
