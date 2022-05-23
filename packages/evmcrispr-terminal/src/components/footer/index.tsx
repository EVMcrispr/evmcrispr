import { Center, Link, Text, VStack } from '@chakra-ui/react';

import { AllSponsors, AragonSponsor } from './Sponsors';
import Blossom from '../../assets/blossom.svg';

const Footer = () => {
  return (
    <>
      <AragonSponsor />
      <AllSponsors />
      <Center py={24}>
        <VStack spacing={8}>
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
