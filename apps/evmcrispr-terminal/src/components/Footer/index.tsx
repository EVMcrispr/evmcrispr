import { Center, Link, Text, VStack } from "@chakra-ui/react";

import Blossom from "../../assets/blossom.svg";

const Footer = () => {
  return (
    <>
      <Center py={10}>
        <VStack spacing={5}>
          <Text color="green.300">powered by Blossom</Text>
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
