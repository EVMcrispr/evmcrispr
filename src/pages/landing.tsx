import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useChain, useSpringRef } from "@react-spring/web";

import Card from "../components/card";

import Brett from "../assets/brett.png";
import Michael from "../assets/michael.png";
import Griff from "../assets/griff.png";

import FadeIn from "../components/animations/fade-in";

const Landing = () => {
  const [showCardContent, setCardContent] = useState(false);
  const typeRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const cardRef = useSpringRef();

  useChain([typeRef, buttonsRef, cardRef]);

  const handleCardContent = () => setCardContent(true);

  return (
    <>
      <FadeIn componentRef={typeRef}>
        <div className="description content">
          <strong>EVMcrispr</strong> is a powerful tool that combines a domain-specific language with a Javascript library to interact with Aragon DAOs. With it, you can bundle <strong>many DAO operations into just one script</strong>, generating a singular transaction, usually a vote. These commands include installing or upgrading apps, changing their permissions, executing actions or interacting with external contracts.
        </div>
      </FadeIn>

      <FadeIn componentRef={buttonsRef}>
        <div className="flex-center buttons">
          <a className="button" href="https://forum.1hive.org/t/commons-swarm-outcomes-3-3-a-tool-to-mutate-a-daos-dna/4924" target="_blank" rel="noreferrer">
            Learn How to Use
          </a>
          <Link className="button" to="/terminal">
            Open Terminal
          </Link>
        </div>
      </FadeIn>

      <FadeIn componentRef={cardRef} onRest={handleCardContent}>
        <div className="cards content">
          <Card
            showContent={showCardContent}
            image={Brett}
            name="Brett Sun"
            info="Former Aragon CTO"
            description="EVMCrispr is the tool every aragonOS DAO has been waiting for. It presents a step change in DAO operations that enables everyone to invoke complex proposals—not just those brave enough to write complex transaction-generating code."
          />
          <Card
            showContent={showCardContent}
            image={Michael}
            name="Michael Egorov"
            info="Founder of Curve"
            description="We had an important upgrade of CurveDAO (based on Aragon) which had to be very well tested given that the DAO controls parameters of a platform which holds more than $20B USD worth of assets. EVMcrispr helped to get this upgrade done safely."
          />
          <Card
            showContent={showCardContent}
            image={Griff}
            name="Griff Green"
            info="Co-founder of Giveth, Commons Stack & DAppNode"
            description="EVMcrispr is what Aragon always needed and it finally has. Through it DAOs can evolve transparently at the speed of the community without the need to trust a technocracy."
          />
        </div>
      </FadeIn>

    </>
  );
};

export default Landing;
