import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useChain, useSpringRef } from "@react-spring/web";

import { Button } from "@/components/retroui/Button";

import Card from "../components/Card";
import FadeIn from "../components/animations/FadeIn";
import Footer from "../components/Footer";
import { AllSponsors } from "../components/Footer/Sponsors";

import Brett from "../assets/brett.png";
import Michael from "../assets/michael.png";
import Griff from "../assets/griff.png";
import logo from "../assets/logo.svg";

const Header = () => {
  return (
    <header className="flex flex-col items-center justify-center pt-32">
      <RouterLink to="/">
        <img src={logo} alt="Logo" width="262" />
      </RouterLink>
    </header>
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
      <main className="max-w-[956px] mx-auto">
        <FadeIn componentRef={typeRef}>
          <div className="pt-16 pb-8 px-6">
            <p className="font-clearer text-white text-center text-2xl">
              <strong className="font-clearer text-evm-green-300">
                EVMcrispr
              </strong>{" "}
              is a powerful tool utilising a domain-specific language for
              batching interactions with EVM chains. Leveraging new Ethereum
              capabilities introduced by the Pectra upgrade, it allows you to{" "}
              <strong className="font-clearer text-evm-green-300">
                bundle many operations into a single, atomic transaction
              </strong>{" "}
              submitted directly from your wallet.
            </p>
          </div>
        </FadeIn>

        <FadeIn componentRef={buttonsRef}>
          <div className="flex justify-center">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <Button variant="secondary" size="2xl" asChild>
                <a
                  href="https://docs.evmcrispr.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Learn How to Use
                </a>
              </Button>
              <Button variant="secondary" size="2xl" asChild>
                <RouterLink to="/terminal">Open Terminal</RouterLink>
              </Button>
            </div>
          </div>
        </FadeIn>

        <FadeIn componentRef={peepsRef}>
          <h1 className="pt-16 text-center text-2xl font-bold text-evm-green-300 font-head">
            Who&apos;s using EVMcrispr?
          </h1>
        </FadeIn>

        <FadeIn componentRef={cardRef} onRest={handleCardContent}>
          <div className="flex flex-col lg:flex-row justify-center items-center pt-8 mb-28 w-full gap-16 pr-4 md:pr-0">
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
          </div>
        </FadeIn>
      </main>
      <FadeIn componentRef={footerRef}>
        <AllSponsors />
        <Footer />
      </FadeIn>
    </>
  );
};

export default Landing;
