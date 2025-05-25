import { Center, Heading, Image, Stack, Text, VStack } from "@chakra-ui/react";

import aragon from "../../assets/aragon.svg";
import giveth from "../../assets/giveth.svg";
import OneHive from "../../assets/1hive.svg";
import curve from "../../assets/curve.svg";
import nftx from "../../assets/nftx.svg";

const sponsors = [
  {
    link: "https://aragon.org/",
    src: aragon,
    name: "Aragon",
  },
  {
    link: "https://1hive.org/",
    src: OneHive,
    name: "1hive",
  },
  {
    link: "https://giveth.io",
    src: giveth,
    name: "Giveth",
  },
  {
    link: "https://nftx.io/",
    src: nftx,
    name: "NFTX",
  },
  {
    link: "https://curve.fi/",
    src: curve,
    name: "Curve",
  },
];

export const AllSponsors = () => {
  return (
    <Center bgColor="rgba(24, 24, 24, 1)" p={14} as="section">
      <VStack spacing={12}>
        <Heading as="h2" color="green.300" size="md" textAlign="center">
          <strong>EVMcrispr</strong> would have not been possible without the
          support of:
        </Heading>
        <Stack
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          align="center"
          width={{ base: "100%", lg: "956px" }}
        >
          {sponsors.map(({ src, link, name }, i) => (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              key={`sponsors-link-${i}`}
            >
              <VStack spacing={10} marginBottom={45}>
                <Image
                  src={src}
                  alt={name}
                  boxSize={{ base: "75%", md: "100%" }}
                />
                <Text color="white">{name}</Text>
              </VStack>
            </a>
          ))}
        </Stack>
      </VStack>
    </Center>
  );
};
