import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/logo.svg";

type HeaderProps = {
  terminalText?: any;
  onClick?: () => void;
};

const Header = ({ terminalText, onClick }: HeaderProps) => {
  const isTerminalClass =
    terminalText !== undefined ? "flex-center-header" : "flex-center";
  return (
    <header className={isTerminalClass}>
      <Link to="/">
        <img src={logo} alt="Logo" width="262" />
      </Link>

      {terminalText !== undefined ? (
        <button onClick={onClick} className="button-header">
          {terminalText}
        </button>
      ) : null}
    </header>
  );
};

export default Header;
