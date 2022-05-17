import { Center, Text, VStack, Stack, Link } from '@chakra-ui/react';
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
      <Center bgColor="rgba(24, 24, 24, 1)" p="50px">
        <VStack spacing={12}>
          <Text color="brand.green" align="center">
            <strong>EVMcrispr</strong> would have not been possible without the
            support of
          </Text>
          <Stack
            direction={{ base: "column", md: "column", lg: "row" }}
            spacing={{ base: 20, md: 20, lg: 48}}
            align="center"
          >
            {sponsors.map(({ src, link, name }) => (
              <a href={link} target="_blank" rel="noreferrer">
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

      <Center as="footer">
        <VStack spacing={6}>
          <Text color="brand.green">powered by Blossom</Text>
          <Link href="https://github.com/blossomlabs" target="_blank" rel="noreferrer">
            <img src={Blossom} alt="Blossom" height="48px" />
          </Link>
        </VStack>
      </Center>
    </>
  );
};

export default Footer;
