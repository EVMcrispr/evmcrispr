import { codename, version } from '@1hive/evmcrispr/package.json';
import { Link, useLocation } from 'react-router-dom';

import logo from '../../assets/logo.svg';
import { useTerminal } from '../../utils/useTerminal';

const Header = () => {
  const location = useLocation();
  const { onClick } = useTerminal();
  const isTerminalClass =
    location.pathname === '/terminal' ? 'flex-center-header' : 'flex-center';
  return (
    <header className={isTerminalClass}>
      <Link to="/">
        <img src={logo} alt="Logo" width="262" />
      </Link>
      {location.pathname === '/terminal' ? (
        <div className="version typewriter" onClick={onClick}>
          {`${codename ? `"${codename}"` : null} v${version}`}
        </div>
      ) : null}
    </header>
  );
};

export default Header;
