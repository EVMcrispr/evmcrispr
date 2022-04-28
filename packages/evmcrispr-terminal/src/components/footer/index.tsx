import React from "react";
import sponsor from "../../assets/sponsor.svg";
import Bee from "../../assets/bee.svg";


const Footer = () => {
  return (
    <>
      <div className="sponsors flex-center ">
        <label htmlFor="">Sponsored by</label>
        <a href="https://giveth.io" target="_blank" rel="noreferrer">
          <img src={sponsor} alt="Sponsor" height="58px" />
        </a>
      </div>

      <footer className="flex-center ">
        <label htmlFor="">powered by Bees</label>
        <a href="https://1hive.org" target="_blank" rel="noreferrer">
          <img src={Bee} alt="Bee" height="48px"></img>
        </a>
      </footer>
    </>
  );
};

export default Footer;
