import React from "react";
import { Link, useLocation } from "react-router-dom";
import logo from "../../assets/logo.svg";

import { codename } from "../../assets/sponsors.json";
import { version } from "@1hive/evmcrispr/package.json";

const Header = () => {
  let location = useLocation();
  const isTerminalClass =
    location.pathname === "/terminal" ? "flex-center-header" : "flex-center";
  return (
    <header className={isTerminalClass}>
        <Link to="/">
          <img src={logo} alt="Logo" width="262" />
        </Link>
        {location.pathname === "/terminal" ? (
          <div className="version typewriter">
            {`${codename ? `"${codename}"` : null} v${version}`}
          </div>
        ) : null}
    </header>
  );
};

export default Header;
