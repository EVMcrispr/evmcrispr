import React from "react";
import Typewriter from "typewriter-effect";
import { Link } from "react-router-dom";
import PageSkeleton from "../components/skeleton";
import Header from "../components/header";
import Card from "../components/card";

import Griff from "../assets/griff.png";
import Michael from "../assets/michael.png";

const Landing = () => {
  return (
    <PageSkeleton>
      <Header />

      <div className="typewriter content">
        <Typewriter
          onInit={(typewriter) => {
            typewriter
              .typeString(
                "<strong style='color: #75F248'>EVMcrispr</strong> is a powerful tool that combines a command line interface with a Javascript library to interact with Aragon DAOs. With it, you can bundle many DAO operations into just one script, generating a singular transaction/vote. These commands include installing or upgrading apps, changing their permissions, executing actions or interacting with external contracts."
              )
              .pauseFor(2500)
              .start();
          }}
        />
      </div>

      <div className="flex-center buttons">
        <a className="button" href="www.google.pt" target="_blank">
          Read Documentation
        </a>
        <Link className="button" to="/terminal">
          Open Terminal
        </Link>
      </div>

      <div className="cards content">
        <Card
          image={Griff}
          name="Griff Green"
          info="Co-founder of Giveth, Commons Stack & DAppNode"
          description=" EVMcrispr is what Aragon always needed and it finally has. At last it offers the level of customization at the app and permission level that our organizations need."
        />
        <Card
          image={Michael}
          name="Michael Egorov"
          info="Founder of Curve"
          description="We had an important upgrade of CurveDAO (based on Aragon) which had to be very well tested given that the DAO controls parameters of a platform which holds more than $20B USD worth of assets. EVMcrispr helped to get this upgrade done safely."
        />
      </div>
    </PageSkeleton>
  );
};

export default Landing;
