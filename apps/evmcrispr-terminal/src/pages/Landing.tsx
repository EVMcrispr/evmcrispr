import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useChain, useSpringRef } from "@react-spring/web";
import {
  Box,
  Button,
  Center,
  Heading,
  Spacer,
  Stack,
  Text,
} from "@chakra-ui/react";

import Card from "../components/Card";
import FadeIn from "../components/animations/FadeIn";
import Footer from "../components/Footer";
import { AllSponsors, AragonSponsor } from "../components/Footer/Sponsors";

import Brett from "../assets/brett.png";
import Michael from "../assets/michael.png";
import Griff from "../assets/griff.png";
import logo from "../assets/logo.svg";

const Header = () => {
  return (
    <Stack
      direction={{ base: "column", md: "column" }}
      as="header"
      alignItems={{ base: "center", md: "center" }}
      justify="center"
      paddingTop={32}
    >
      <RouterLink to="/">
        <img src={logo} alt="Logo" width="262" />
      </RouterLink>
    </Stack>
  );
};

const Landing = () => {
  const [showCardContent, setCardContent] = useState(false);
  const typeRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const cardRef = useSpringRef();
  const peepsRef = useSpringRef();
  const footerRef = useSpringRef();

  useChain([typeRef, buttonsRef, peepsRef, cardRef, footerRef]);

  const handleCardContent = () => setCardContent(true);

  return (
    <>
      <Header />
      <Box as="main" maxWidth="956px" margin="0 auto">
        <FadeIn componentRef={typeRef}>
          <Box pt={16} pb={8} px={6}>
            <Text
              variant="clearer"
              color="white"
              textAlign="center"
              fontSize="2xl"
            >
              <Text as="strong" variant="clearer" color="green.300">
                EVMcrispr
              </Text>{" "}
              is a powerful tool that combines a domain-specific language with a
              Javascript library to interact with Aragon DAOs. With it, you can
              bundle{" "}
              <Text as="strong" variant="clearer" color="green.300">
                many DAO operations into just one script
              </Text>
              , generating a singular transaction, usually a vote. These
              commands include installing or upgrading apps, changing their
              permissions, executing actions or interacting with external
              contracts.
            </Text>
          </Box>
        </FadeIn>

        <FadeIn componentRef={buttonsRef}>
          <Center>
            <Stack
              direction={{ base: "column", md: "row" }}
              alignItems="center"
            >
              <Button
                variant="blue"
                size="lg"
                as="a"
                href="https://docs.evmcrispr.com/"
                target="_blank"
                rel="noreferrer"
              >
                Learn How to Use
              </Button>
              <Spacer />
              <Button
                variant="blue"
                colorScheme="blue"
                size="lg"
                as={RouterLink}
                to="/terminal"
              >
                Open Terminal
              </Button>
            </Stack>
          </Center>
        </FadeIn>

        <FadeIn componentRef={peepsRef}>
          <Heading
            pt={16}
            textAlign="center"
            as="h1"
            size="lg"
            color="green.300"
          >
            Who&apos;s using EVMcrispr?
          </Heading>
        </FadeIn>

        <FadeIn componentRef={cardRef} onRest={handleCardContent}>
          <Stack
            direction={{ base: "column", lg: "row" }}
            justify="center"
            align="center"
            pt={8}
            mb={28}
            width="100%"
            gap={16}
            pr={{ base: 4, md: 0 }}
          >
            <Card
              showContent={showCardContent}
              image={Brett}
              height={150}
              name="Brett Sun"
              info="Former Aragon CTO"
              description={`"EVMCrispr is the tool every aragonOS DAO has been waiting for. It presents a step change in DAO operations that enables everyone to invoke complex proposals—not just those brave enough to write complex transaction-generating code."`}
            />
            <Card
              showContent={showCardContent}
              image={Michael}
              name="Michael Egorov"
              info="Founder of Curve"
              description={`"We had an important upgrade of CurveDAO (based on Aragon) which had to be very well tested given that the DAO controls parameters of a platform which holds more than $20B USD worth of assets. EVMcrispr helped to get this upgrade done safely."`}
            />
            <Card
              showContent={showCardContent}
              image={Griff}
              name="Griff Green"
              info="Co-founder of Giveth, Commons Stack & DAppNode"
              description={`"EVMcrispr is what Aragon always needed and it finally has. Through it DAOs can evolve transparently at the speed of the community without the need to trust a technocracy."`}
            />
          </Stack>
        </FadeIn>
      </Box>
      <FadeIn componentRef={footerRef}>
        <AragonSponsor />
        <AllSponsors />
        <Footer />
      </FadeIn>
    </>
  );
};

export default Landing;
