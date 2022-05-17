import { Center, Heading, Link, Stack, Text, VStack } from '@chakra-ui/react';

import giveth from '../../assets/giveth.svg';
import OneHive from '../../assets/1hive.svg';
import curve from '../../assets/curve.svg';
import nftx from '../../assets/nftx.svg';
import Blossom from '../../assets/blossom.svg';

const sponsors = [
  {
    link: 'https://nftx.io/',
    src: nftx,
    name: 'Nftx',
  },
  {
    link: 'https://giveth.io',
    src: giveth,
    name: 'Giveth',
  },
  {
    link: 'https://1hive.org/',
    src: OneHive,
    name: '1hive',
  },
  {
    link: 'https://curve.fi/',
    src: curve,
    name: 'Curve',
  },
];

const Footer = () => {
  return (
    <>
      <Center bgColor="rgba(24, 24, 24, 1)" p={14} as="section">
        <VStack spacing={12}>
          <Heading as="h2" color="brand.green" size="md" textAlign="center">
            <strong>EVMcrispr</strong> would have not been possible without the
            support of
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
                <VStack spacing={10}>
                  <img src={src} alt={name} />
                  <Text color="white" textTransform="uppercase">
                    {name}
                  </Text>
                </VStack>
              </a>
            ))}
          </Stack>
        </VStack>
      </Center>

      <Center py={14}>
        <VStack spacing={6}>
          <Text color="brand.green">powered by Blossom</Text>
          <Link
            href="https://github.com/blossomlabs"
            target="_blank"
            rel="noreferrer"
          >
            <img src={Blossom} alt="Blossom" height="48px" />
          </Link>
        </VStack>
      </Center>
    </>
  );
};

export default Footer;
