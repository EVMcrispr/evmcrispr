import React, { useState } from "react";
import Typewriter from "typewriter-effect";
import { Link } from "react-router-dom";
import { useChain, useSpringRef } from "@react-spring/web";

import PageSkeleton from "../components/skeleton";
import Header from "../components/header";
import Card from "../components/card";

import Griff from "../assets/griff.png";
import Michael from "../assets/michael.png";
import FadeIn from "../components/animations/fade-in";

const Landing = () => {
  const [showCardContent, setCardContent] = useState(false);
  const logoRef = useSpringRef();
  const typeRef = useSpringRef();
  const buttonsRef = useSpringRef();
  const cardRef = useSpringRef();

  useChain([logoRef, typeRef, buttonsRef, cardRef]);

  const handleCardContent = () => setCardContent(true);

  return (
    <PageSkeleton>
      <Header logoRef={logoRef} />

      <FadeIn componentRef={typeRef}>
        <div className="typewriter content">
          <Typewriter
            options={{ delay: 50 }}
            onInit={(typewriter) => {
              typewriter
                .typeString(
                  "<strong style='color: #75F248'>EVMcrispr</strong> is a powerful tool that combines a command line interface with a Javascript library to interact with Aragon DAOs. With it, you can bundle many DAO operations into just one script, generating a singular transaction/vote. These commands include installing or upgrading apps, changing their permissions, executing actions or interacting with external contracts."
                )
                .start();
            }}
          />
        </div>
      </FadeIn>

      <FadeIn componentRef={buttonsRef}>
        <div className="flex-center buttons">
          <a className="button" href="www.google.pt" target="_blank">
            Read Documentation
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
            image={Griff}
            name="Griff Green"
            info="Co-founder of Giveth, Commons Stack & DAppNode"
            description=" EVMcrispr is what Aragon always needed and it finally has. At last it offers the level of customization at the app and permission level that our organizations need."
          />
          <Card
            showContent={showCardContent}
            image={Michael}
            name="Michael Egorov"
            info="Founder of Curve"
            description="We had an important upgrade of CurveDAO (based on Aragon) which had to be very well tested given that the DAO controls parameters of a platform which holds more than $20B USD worth of assets. EVMcrispr helped to get this upgrade done safely."
          />
        </div>
      </FadeIn>

    </PageSkeleton>
  );
};

export default Landing;
