import React from "react";
import { Link } from "react-router-dom";
import FadeIn from "../animations/fade-in";
import logo from "../../assets/logo.svg";

type HeaderProps = {
  terminalText?: any;
  onClick?: () => void;
  logoRef?: any;
};

const Header = ({ terminalText, onClick, logoRef }: HeaderProps) => {
  const isTerminalClass =
    terminalText !== undefined ? "flex-center-header" : "flex-center";
  return (
    <header className={isTerminalClass}>
      <FadeIn componentRef={logoRef}>
        <Link to="/">
          <img src={logo} alt="Logo" width="262" />
        </Link>
      </FadeIn>

      {terminalText !== undefined ? (
        <button onClick={onClick} className="button-header">
          {terminalText}
        </button>
      ) : null}
    </header>
  );
};

export default Header;
